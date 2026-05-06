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
import logging
from typing import Callable

from mirage.cache.file.mixin import FileCacheMixin
from mirage.io import CachableAsyncIterator, IOResult

logger = logging.getLogger(__name__)


async def apply_io(
    cache: FileCacheMixin,
    io: IOResult,
    is_cacheable: Callable[[str], bool] | None = None,
) -> None:
    cache_set = set(io.cache)
    max_bytes = getattr(cache, "max_drain_bytes", None)
    for path in io.cache:
        if is_cacheable is not None and not is_cacheable(path):
            continue
        data = io.reads.get(path)
        if data is None:
            data = io.writes.get(path)
        if data is None:
            continue
        if isinstance(data, bytes):
            await cache.set(path, data)
        elif isinstance(data, CachableAsyncIterator):
            if data.exhausted:
                await cache.set(path, b"".join(data._buffer))
            else:
                if (hasattr(cache, "_drain_tasks")
                        and path not in cache._drain_tasks
                        and not await cache.exists(path)):
                    task = asyncio.create_task(
                        _background_drain(cache, path, data, max_bytes))
                    cache._drain_tasks[path] = task
                    task.add_done_callback(
                        lambda t, p=path: cache._drain_tasks.pop(p, None))
    for path in io.writes:
        if path in cache_set:
            continue
        if is_cacheable is not None and not is_cacheable(path):
            continue
        await cache.remove(path)


async def _background_drain(
    cache: FileCacheMixin,
    path: str,
    it: CachableAsyncIterator,
    max_bytes: int | None = None,
) -> None:
    """Drain an unconsumed stream and write to cache.

    Cancelled by workspace.close() if the stream is still draining at
    shutdown. If max_bytes is set and the drain exceeds it without
    exhausting the source, the partial buffer is discarded and the path
    is not cached (next read will fetch fresh from the resource).
    """
    try:
        if max_bytes is None:
            materialized = await it.drain()
            await cache.add(path, materialized)
            return
        materialized, fully_drained = await it.drain_bounded(max_bytes)
        if fully_drained:
            await cache.add(path, materialized)
        else:
            logger.info(
                "cache drain budget exceeded for %s "
                "(>%d bytes), skipping cache fill", path, max_bytes)
    except asyncio.CancelledError:
        logger.warning("background drain cancelled for %s", path)
    except Exception:
        logger.warning("background drain failed for %s", path, exc_info=True)
