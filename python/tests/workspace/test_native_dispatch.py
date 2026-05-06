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
import tempfile

import pytest

from mirage.resource.ram import RAMResource
from mirage.workspace import Workspace


@pytest.mark.asyncio
async def test_workspace_set_fuse_mountpoint():
    ws = Workspace(resources={"/data": RAMResource()})
    assert ws.fuse_mountpoint is None
    ws.set_fuse_mountpoint("/tmp/test")
    assert ws.fuse_mountpoint == "/tmp/test"
    ws.set_fuse_mountpoint(None)
    assert ws.fuse_mountpoint is None


@pytest.mark.asyncio
async def test_workspace_native_dispatch():
    """When fuse_mountpoint is set, native=True routes to subprocess."""
    with tempfile.TemporaryDirectory() as tmpdir:
        with open(os.path.join(tmpdir, "hello.txt"), "w") as f:
            f.write("hello world\n")

        ws = Workspace(resources={"/data": RAMResource()})
        ws.set_fuse_mountpoint(tmpdir)

        io = await ws.execute("cat hello.txt", native=True)
        assert io.stdout == b"hello world\n"
        assert io.exit_code == 0


@pytest.mark.asyncio
async def test_workspace_native_without_mountpoint():
    """When no fuse_mountpoint, native=True should fall back to VFS path."""
    ws = Workspace(resources={"/data": RAMResource()})
    io = await ws.execute("echo hello", native=True)
    assert io.exit_code == 0
