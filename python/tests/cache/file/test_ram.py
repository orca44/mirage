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

import pytest

from mirage.cache.file.ram import RAMFileCacheStore


@pytest.mark.asyncio
async def test_data_stored_in_store_files():
    cache = RAMFileCacheStore(cache_limit="1MB")
    await cache.set("/f.txt", b"hello")
    assert cache._store.files["/f.txt"] == b"hello"


@pytest.mark.asyncio
async def test_entry_stored_in_entries():
    cache = RAMFileCacheStore(cache_limit="1MB")
    await cache.set("/f.txt", b"hello")
    entry = cache._entries["/f.txt"]
    assert entry.size == 5


@pytest.mark.asyncio
async def test_remove_cleans_store():
    cache = RAMFileCacheStore(cache_limit="1MB")
    await cache.set("/f.txt", b"data")
    assert "/f.txt" in cache._store.files
    await cache.remove("/f.txt")
    assert "/f.txt" not in cache._store.files
    assert "/f.txt" not in cache._entries


@pytest.mark.asyncio
async def test_clear_empties_store():
    cache = RAMFileCacheStore(cache_limit="1MB")
    await cache.set("/a", b"aaa")
    await cache.set("/b", b"bbb")
    await cache.clear()
    assert len(cache._store.files) == 0
    assert len(cache._entries) == 0


@pytest.mark.asyncio
async def test_locks_cleaned_after_remove():
    cache = RAMFileCacheStore(cache_limit="1MB")
    await cache.set("/a", b"data")
    await cache.remove("/a")
    assert "/a" not in cache._key_locks


@pytest.mark.asyncio
async def test_locks_cleaned_after_clear():
    cache = RAMFileCacheStore(cache_limit="1MB")
    await cache.set("/a", b"aaa")
    await cache.set("/b", b"bbb")
    await cache.clear()
    assert len(cache._key_locks) == 0


@pytest.mark.asyncio
async def test_locks_cleaned_after_eviction():
    cache = RAMFileCacheStore(cache_limit=100)
    await cache.set("/a", b"x" * 60)
    await cache.set("/b", b"y" * 60)
    assert "/a" not in cache._key_locks


@pytest.mark.asyncio
async def test_drain_task_cancelled_on_remove():
    cache = RAMFileCacheStore(cache_limit="1MB")

    cancelled = False

    async def slow():
        nonlocal cancelled
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            cancelled = True

    task = asyncio.create_task(slow())
    cache._drain_tasks["/a"] = task
    await cache.set("/a", b"data")
    await asyncio.sleep(0)
    await cache.remove("/a")
    await asyncio.sleep(0)
    assert cancelled
