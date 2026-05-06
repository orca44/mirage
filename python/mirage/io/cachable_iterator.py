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

import asyncio
from collections.abc import AsyncIterator


class CachableAsyncIterator:
    """Wraps AsyncIterator[bytes], buffers chunks as consumed.

    Drains remainder on request.

    Args:
        source (AsyncIterator[bytes]): The underlying async byte iterator.
    """

    def __init__(self, source: AsyncIterator[bytes]) -> None:
        self._source = source
        self._buffer: list[bytes] = []
        self._exhausted = False
        self.drain_event: asyncio.Event = asyncio.Event()

    @property
    def exhausted(self) -> bool:
        """Whether the underlying source iterator is fully consumed."""
        return self._exhausted

    def __aiter__(self) -> "CachableAsyncIterator":
        return self

    async def __anext__(self) -> bytes:
        try:
            chunk = await self._source.__anext__()
        except StopAsyncIteration:
            self._exhausted = True
            # Signal drain_event so wait_for_drain() callers don't hang
            # when the iterator is exhausted via normal iteration
            # instead of drain(). (Scenario A fix)
            self.drain_event.set()
            raise
        self._buffer.append(chunk)
        return chunk

    async def drain(self) -> bytes:
        """Consume remaining chunks and return all accumulated bytes."""
        # Use try/finally to guarantee drain_event is set even when the
        # source raises an exception (Scenario B) or the task is cancelled
        # (Scenario C). Without this, wait_for_drain() hangs forever.
        try:
            async for chunk in self._source:
                self._buffer.append(chunk)
        finally:
            self._exhausted = True
            self.drain_event.set()
        return b"".join(self._buffer)

    async def drain_bounded(self, max_bytes: int) -> tuple[bytes, bool]:
        """Drain remaining chunks but stop if buffer exceeds max_bytes.

        Returns (accumulated_bytes, fully_drained). When fully_drained
        is False, the source still has unread chunks but we stopped
        because the budget was exceeded; the partial buffer is returned
        to the caller so it can decide whether to use or discard it.
        """
        total = sum(len(c) for c in self._buffer)
        try:
            async for chunk in self._source:
                self._buffer.append(chunk)
                total += len(chunk)
                if total > max_bytes:
                    return b"".join(self._buffer), False
        finally:
            self._exhausted = True
            self.drain_event.set()
        return b"".join(self._buffer), True

    async def wait_for_drain(self) -> bytes:
        """Wait for a background drain to complete, then return the full data.

        Returns:
            bytes: All accumulated bytes after drain completes.
        """
        await self.drain_event.wait()
        return b"".join(self._buffer)
