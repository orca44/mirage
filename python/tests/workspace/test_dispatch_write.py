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

from mirage.resource.ram import RAMResource
from mirage.types import MountMode
from mirage.workspace import Workspace


def _make_ws() -> tuple[Workspace, RAMResource]:
    resource = RAMResource()
    resource._store.files["/file.txt"] = b"OLD"
    ws = Workspace(
        {"/data": (resource, MountMode.WRITE)},
        mode=MountMode.WRITE,
    )
    return ws, resource


def test_redirect_write_overrides_cached_read():
    ws, resource = _make_ws()

    async def run() -> None:
        await ws.execute("cat /data/file.txt")
        await ws.execute('echo -n "NEW" > /data/file.txt')

    asyncio.run(run())
    assert resource._store.files["/file.txt"] == b"NEW", (
        "redirect-write should reach the backend even when the path was "
        "previously cached by a read")


def test_redirect_append_after_cached_read():
    ws, resource = _make_ws()

    async def run() -> None:
        await ws.execute("cat /data/file.txt")
        await ws.execute('echo -n "MORE" >> /data/file.txt')

    asyncio.run(run())
    assert resource._store.files["/file.txt"] == b"OLDMORE", (
        "redirect-append should reach the backend even when the path was "
        "previously cached by a read")
