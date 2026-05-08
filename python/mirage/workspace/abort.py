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


class MirageAbortError(RuntimeError):

    def __init__(self) -> None:
        super().__init__("execute aborted")


async def cancellable_sleep(
    seconds: float,
    cancel: asyncio.Event | None = None,
) -> None:
    if cancel is None:
        await asyncio.sleep(seconds)
        return
    if cancel.is_set():
        raise MirageAbortError()
    sleep_task = asyncio.create_task(asyncio.sleep(seconds))
    cancel_task = asyncio.create_task(cancel.wait())
    done, pending = await asyncio.wait(
        {sleep_task, cancel_task},
        return_when=asyncio.FIRST_COMPLETED,
    )
    for p in pending:
        p.cancel()
    if cancel_task in done:
        raise MirageAbortError()
