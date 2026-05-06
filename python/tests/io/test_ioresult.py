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

from mirage.io.types import IOResult


def test_default_exit_code():
    io = IOResult()
    assert io.exit_code == 0


def test_merge_combines_stderr():

    async def _run():
        a = IOResult(stderr=b"err1")
        b = IOResult(stderr=b"err2")
        merged = await a.merge(b)
        assert merged.stderr == b"err1err2"

    asyncio.run(_run())


def test_merge_combines_cache():

    async def _run():
        a = IOResult(cache=["/a"])
        b = IOResult(cache=["/b"])
        merged = await a.merge(b)
        assert merged.cache == ["/a", "/b"]

    asyncio.run(_run())


def test_merge_aggregate_takes_max_exit_code():

    async def _run():
        a = IOResult(exit_code=1)
        b = IOResult(exit_code=0)
        merged = await a.merge_aggregate(b)
        assert merged.exit_code == 1

    asyncio.run(_run())


def test_merge_aggregate_combines_stderr():

    async def _run():
        a = IOResult(stderr=b"err1", exit_code=1)
        b = IOResult(stderr=b"err2", exit_code=0)
        merged = await a.merge_aggregate(b)
        assert merged.stderr == b"err1err2"
        assert merged.exit_code == 1

    asyncio.run(_run())


def test_merge_aggregate_zero_when_all_succeed():

    async def _run():
        a = IOResult(exit_code=0)
        b = IOResult(exit_code=0)
        merged = await a.merge_aggregate(b)
        assert merged.exit_code == 0

    asyncio.run(_run())
