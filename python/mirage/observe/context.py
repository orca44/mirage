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
from contextvars import ContextVar

from mirage.observe.record import OpRecord

_recorder: ContextVar[list[OpRecord] | None] = ContextVar("_recorder",
                                                          default=None)
_virtual_prefix: ContextVar[str] = ContextVar("_virtual_prefix", default="")


def start_recording() -> list[OpRecord]:
    """Activate byte recording for the current async context.

    Returns:
        list[OpRecord]: The list that will collect records.
    """
    records: list[OpRecord] = []
    _recorder.set(records)
    return records


def stop_recording() -> None:
    """Deactivate byte recording for the current async context."""
    _recorder.set(None)


def set_virtual_prefix(prefix: str) -> None:
    """Set the mount prefix for the current async context.

    Args:
        prefix (str): Mount prefix (e.g. "/s3"). Empty string to clear.
    """
    _virtual_prefix.set(prefix)


def _apply_prefix(path: str) -> str:
    prefix = _virtual_prefix.get("")
    if prefix and not path.startswith(prefix):
        return prefix.rstrip("/") + path
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
    recorder = _recorder.get()
    if recorder is None:
        return
    elapsed = int(time.monotonic() * 1000) - start_ms
    recorder.append(
        OpRecord(
            op=op,
            path=_apply_prefix(path),
            source=source,
            bytes=nbytes,
            timestamp=int(time.time() * 1000),
            duration_ms=elapsed,
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
    recorder = _recorder.get()
    if recorder is None:
        return None
    rec = OpRecord(
        op=op,
        path=_apply_prefix(path),
        source=source,
        bytes=0,
        timestamp=int(time.time() * 1000),
        duration_ms=0,
    )
    recorder.append(rec)
    return rec
