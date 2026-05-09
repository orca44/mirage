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


def _seed(name: str, body: bytes) -> RAMResource:
    r = RAMResource()
    r._store.files[f"/{name}"] = body
    return r


def test_session_outside_allowlist_is_denied():
    a = _seed("x.txt", b"public")
    b = _seed("secret.txt", b"SECRET")
    ws = Workspace({"/a": a, "/b": b})
    ws.create_session("agent", allowed_mounts=frozenset({"/a"}))

    async def run():
        ok = await ws.execute("cat /a/x.txt", session_id="agent")
        denied = await ws.execute("cat /b/secret.txt", session_id="agent")
        return ok, denied

    ok, denied = asyncio.run(run())
    assert ok.exit_code == 0
    assert b"public" in (ok.stdout or b"")
    assert denied.exit_code != 0
    stderr = denied.stderr or b""
    assert b"not allowed" in stderr
    assert b"/b" in stderr


def test_default_session_unrestricted():
    a = _seed("x.txt", b"hi")
    ws = Workspace({"/a": a})

    async def run():
        return await ws.execute("cat /a/x.txt")

    io = asyncio.run(run())
    assert io.exit_code == 0
    assert b"hi" in (io.stdout or b"")


def test_allowed_session_can_write_to_its_mount():
    a = _seed("x.txt", b"hi")
    from mirage.types import MountMode
    ws = Workspace({"/a": (a, MountMode.WRITE)}, mode=MountMode.WRITE)
    ws.create_session("agent", allowed_mounts=frozenset({"/a"}))

    async def run():
        return await ws.execute("echo new > /a/y.txt", session_id="agent")

    io = asyncio.run(run())
    assert io.exit_code == 0, f"unexpected denial: {io}"
    assert a._store.files.get("/y.txt") == b"new\n"


def test_observer_prefix_always_allowed():
    a = _seed("x.txt", b"hi")
    ws = Workspace({"/a": a})
    ws.create_session("agent", allowed_mounts=frozenset({"/a"}))

    async def run():
        return await ws.execute("ls /.sessions", session_id="agent")

    io = asyncio.run(run())
    assert io.exit_code == 0, (
        f"observer prefix should always be readable, got {io}")


def test_ops_blocks_programmatic_read_outside_allowlist():
    import pytest

    from mirage.workspace.session import (reset_current_session,
                                          set_current_session)

    a = _seed("x.txt", b"public")
    b = _seed("secret.txt", b"SECRET")
    ws = Workspace({"/a": a, "/b": b})
    sess = ws.create_session("agent", allowed_mounts=frozenset({"/a"}))

    async def run():
        token = set_current_session(sess)
        try:
            assert await ws.ops.read("/a/x.txt") == b"public"
            with pytest.raises(PermissionError, match="not allowed"):
                await ws.ops.read("/b/secret.txt")
        finally:
            reset_current_session(token)

    asyncio.run(run())
