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
from mirage.workspace import Workspace


def test_workspace_default_no_fuse():
    ws = Workspace(resources={"/data": RAMResource()})
    assert ws.fuse_mountpoint is None
    assert ws._native is False
    asyncio.run(ws.close())


def test_workspace_native_flag():
    ws = Workspace(resources={"/data": RAMResource()}, native=True)
    assert ws._native is True
    asyncio.run(ws.close())
