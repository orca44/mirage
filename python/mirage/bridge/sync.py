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
import concurrent.futures


def run_async_from_sync(coro, loop=None):
    """Call from a sync thread to run an async coroutine.

    Args:
        coro: The coroutine to run.
        loop (asyncio.AbstractEventLoop | None): Shared event loop.
            If provided, uses run_coroutine_threadsafe.
            If None, creates a new event loop.
    """
    if loop is not None:
        future = asyncio.run_coroutine_threadsafe(coro, loop)
        return future.result()
    try:
        asyncio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor(1) as pool:
            return pool.submit(asyncio.run, coro).result()
    except RuntimeError:
        return asyncio.run(coro)
