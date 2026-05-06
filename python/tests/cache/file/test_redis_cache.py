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

import os

import pytest
import pytest_asyncio

from mirage.cache.file.redis import RedisFileCacheStore

REDIS_URL = os.environ.get("REDIS_URL", "")
pytestmark = pytest.mark.skipif(not REDIS_URL, reason="REDIS_URL not set")


@pytest_asyncio.fixture()
async def cache():
    c = RedisFileCacheStore(
        cache_limit="1MB",
        url=REDIS_URL,
        key_prefix="test:cache:",
    )
    await c.clear()
    yield c
    await c.clear()
    await c._store.close()


@pytest.mark.asyncio
async def test_set_and_get(cache):
    await cache.set("/file.txt", b"hello")
    result = await cache.get("/file.txt")
    assert result == b"hello"


@pytest.mark.asyncio
async def test_get_missing(cache):
    result = await cache.get("/nope")
    assert result is None


@pytest.mark.asyncio
async def test_remove(cache):
    await cache.set("/file.txt", b"data")
    await cache.remove("/file.txt")
    assert await cache.get("/file.txt") is None


@pytest.mark.asyncio
async def test_exists(cache):
    assert await cache.exists("/file.txt") is False
    await cache.set("/file.txt", b"data")
    assert await cache.exists("/file.txt") is True


@pytest.mark.asyncio
async def test_is_fresh(cache):
    await cache.set("/file.txt", b"data", fingerprint="abc123")
    assert await cache.is_fresh("/file.txt", "abc123") is True
    assert await cache.is_fresh("/file.txt", "different") is False


@pytest.mark.asyncio
async def test_is_fresh_missing(cache):
    assert await cache.is_fresh("/nope", "abc") is False


@pytest.mark.asyncio
async def test_clear(cache):
    await cache.set("/a.txt", b"a")
    await cache.set("/b.txt", b"b")
    await cache.clear()
    assert await cache.get("/a.txt") is None
    assert await cache.get("/b.txt") is None


@pytest.mark.asyncio
async def test_add_new(cache):
    result = await cache.add("/file.txt", b"data")
    assert result is True
    assert await cache.get("/file.txt") == b"data"


@pytest.mark.asyncio
async def test_add_existing(cache):
    await cache.set("/file.txt", b"first")
    result = await cache.add("/file.txt", b"second")
    assert result is False
    assert await cache.get("/file.txt") == b"first"


@pytest.mark.asyncio
async def test_set_with_fingerprint(cache):
    await cache.set("/file.txt", b"data", fingerprint="fp1")
    assert await cache.is_fresh("/file.txt", "fp1") is True


@pytest.mark.asyncio
async def test_cache_limit(cache):
    assert cache.cache_limit == 1 * 1024 * 1024


@pytest.mark.asyncio
async def test_key_prefix_isolation():
    c1 = RedisFileCacheStore(url=REDIS_URL, key_prefix="test:cache:ns1:")
    c2 = RedisFileCacheStore(url=REDIS_URL, key_prefix="test:cache:ns2:")
    await c1.clear()
    await c2.clear()
    await c1.set("/shared", b"from-c1")
    assert await c2.get("/shared") is None
    assert await c1.get("/shared") == b"from-c1"
    await c1.clear()
    await c2.clear()
    await c1._store.close()
    await c2._store.close()
