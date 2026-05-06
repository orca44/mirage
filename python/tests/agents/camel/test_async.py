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

from mirage.agents.camel._async import AsyncRunner


def test_run_from_sync_with_no_loop():
    runner = AsyncRunner()

    async def coro():
        await asyncio.sleep(0)
        return 42

    assert runner.run(coro()) == 42
    runner.close()


def test_run_returns_exception():
    runner = AsyncRunner()

    async def boom():
        raise ValueError("nope")

    with pytest.raises(ValueError, match="nope"):
        runner.run(boom())
    runner.close()


@pytest.mark.asyncio
async def test_run_from_inside_running_loop():
    runner = AsyncRunner()

    async def coro():
        await asyncio.sleep(0)
        return "from-loop"

    result = await asyncio.to_thread(runner.run, coro())
    assert result == "from-loop"
    runner.close()
