# ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========

import time
from collections.abc import AsyncIterator
from contextvars import ContextVar
from dataclasses import dataclass, field

from mirage.observe.record import OpRecord


@dataclass(frozen=True)
class Recorder:
    """Active recording state for a session.

    Bundles the sink (shared by reference across all push frames) with
    the mount_prefix for the current async frame. Frozen so each push
    is task-isolated: ``push_mount_prefix`` creates a new Recorder for
    the calling task via ``_recorder.set``, never mutates the parent.
    The sink list is the one piece that's intentionally shared, so
    records emitted from any frame land in the same collection.

    Args:
        sink (list[OpRecord]): Where new records are appended.
        mount_prefix (str): Current frame's mount prefix (e.g. "/s3").
            Empty when no mount is active.
    """

    sink: list[OpRecord] = field(default_factory=list)
    mount_prefix: str = ""


_recorder: ContextVar[Recorder | None] = ContextVar("_recorder", default=None)


def start_recording() -> list[OpRecord]:
    """Activate byte recording for the current async context.

    Returns:
        list[OpRecord]: The list that will collect records.
    """
    rec = Recorder()
    _recorder.set(rec)
    return rec.sink


def stop_recording() -> None:
    """Deactivate byte recording for the current async context."""
    _recorder.set(None)


def active_recorder() -> Recorder | None:
    """Return the active Recorder for the current async context, if any."""
    return _recorder.get()


def push_mount_prefix(prefix: str) -> str:
    """Set the mount prefix on the active Recorder. Returns the previous
    prefix so callers can restore it.

    Task-isolated: replaces the Recorder for the current task via
    ``_recorder.set`` (the new Recorder shares the same sink list, so
    records still aggregate together). Other tasks reading the
    Recorder via their own contextvar copy continue to see their
    previous prefix.

    No-op (and returns "") when no recorder is active.

    Args:
        prefix (str): Mount prefix (e.g. "/s3"). Empty string to clear.

    Returns:
        str: The prefix that was active before this call.
    """
    rec = _recorder.get()
    if rec is None:
        return ""
    _recorder.set(Recorder(sink=rec.sink, mount_prefix=prefix))
    return rec.mount_prefix


async def with_mount_prefix(prefix: str,
                            it: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
    """Wrap an async iterator so the recorder's mount prefix is `prefix`
    during each ``__anext__`` of the underlying stream.

    Mirrors the side-effect-on-iteration pattern used by
    ``exit_on_empty``. Lets dispatchers preserve resource backends as
    ``async def with yield`` while still capturing the correct mount
    prefix in records emitted lazily during stream consumption.

    Args:
        prefix (str): Mount prefix to push during iteration.
        it (AsyncIterator[bytes]): The stream to wrap.
    """
    aiter = it.__aiter__()
    while True:
        prev = push_mount_prefix(prefix)
        try:
            chunk = await aiter.__anext__()
        except StopAsyncIteration:
            push_mount_prefix(prev)
            return
        push_mount_prefix(prev)
        yield chunk


def _virtual(path: str, prefix: str) -> str:
    if prefix and not path.startswith(prefix):
        return prefix + path
    return path


def record(op: str, path: str, source: str, nbytes: int,
           start_ms: int) -> None:
    """Record a byte transfer event. No-op if no recording context is active.

    Args:
        op (str): Operation name ("read", "write").
        path (str): Resource-relative path.
        source (str): Resource name ("s3", "ram", "disk").
        nbytes (int): Bytes transferred.
        start_ms (int): Monotonic start time in milliseconds.
    """
    rec = _recorder.get()
    if rec is None:
        return
    elapsed = int(time.monotonic() * 1000) - start_ms
    prefix = rec.mount_prefix
    rec.sink.append(
        OpRecord(
            op=op,
            path=_virtual(path, prefix),
            source=source,
            bytes=nbytes,
            timestamp=int(time.time() * 1000),
            duration_ms=elapsed,
            mount_prefix=prefix,
        ))


def record_stream(op: str, path: str, source: str) -> OpRecord | None:
    """Start recording a streaming transfer. Returns a mutable OpRecord.

    The caller updates `rec.bytes` as chunks flow through. The record is
    appended to the active recorder immediately so it captures partial
    consumption (e.g., head stopping early).

    Returns None if no recording context is active.

    Args:
        op (str): Operation name ("read", "write").
        path (str): Resource-relative path.
        source (str): Resource name ("s3", "ram", "disk").

    Returns:
        OpRecord | None: Mutable record, or None if not recording.
    """
    rec = _recorder.get()
    if rec is None:
        return None
    prefix = rec.mount_prefix
    op_rec = OpRecord(
        op=op,
        path=_virtual(path, prefix),
        source=source,
        bytes=0,
        timestamp=int(time.time() * 1000),
        duration_ms=0,
        mount_prefix=prefix,
    )
    rec.sink.append(op_rec)
    return op_rec
