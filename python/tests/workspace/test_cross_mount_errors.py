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


def _make_ws():
    ram1 = RAMResource()
    ram2 = RAMResource()
    ram1._store.files["/file.txt"] = b"line1\nline2\nline3\nline4\nline5\n"
    ram2._store.files["/file.txt"] = b"aaa\nbbb\nccc\n"
    return Workspace(
        {
            "/a/": (ram1, MountMode.WRITE),
            "/b/": (ram2, MountMode.WRITE)
        }, )


def _run(ws, cmd):

    async def _inner():
        io = await ws.execute(cmd)
        return await io.stdout_str(), await io.stderr_str(), io.exit_code

    return asyncio.run(_inner())


def test_cross_mount_head_invalid_n():
    ws = _make_ws()
    out, err, code = _run(ws, "head -n abc /a/file.txt /b/file.txt")
    assert code == 1
    assert "invalid number" in err
    assert "abc" in err


def test_cross_mount_tail_invalid_n():
    ws = _make_ws()
    out, err, code = _run(ws, "tail -n abc /a/file.txt /b/file.txt")
    assert code == 1
    assert "invalid number" in err
    assert "abc" in err


def test_cross_mount_head_valid_n():
    ws = _make_ws()
    out, err, code = _run(ws, "head -n 2 /a/file.txt /b/file.txt")
    assert code == 0
    assert "line1" in out
    assert "line2" in out
    assert "aaa" in out
    assert "bbb" in out


def test_cross_mount_tail_valid_n():
    ws = _make_ws()
    out, err, code = _run(ws, "tail -n 1 /a/file.txt /b/file.txt")
    assert code == 0
    assert "line5" in out
    assert "ccc" in out


def test_cross_mount_head_default_n():
    ws = _make_ws()
    out, err, code = _run(ws, "head /a/file.txt /b/file.txt")
    assert code == 0
    assert "line1" in out
    assert "aaa" in out
