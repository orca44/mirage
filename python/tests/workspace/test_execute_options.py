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

from mirage import MountMode, Workspace
from mirage.resource.ram import RAMResource
from mirage.types import DEFAULT_SESSION_ID


def _make_ws():
    resource = RAMResource()
    store = resource._store
    store.dirs.add("/")
    store.dirs.add("/subdir")
    store.dirs.add("/other")
    store.files["/subdir/file.txt"] = b"hello"
    store.modified["/subdir/file.txt"] = "2024-01-01"
    return Workspace({"/ram/": resource}, mode=MountMode.WRITE)


# ── cwd tests ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cwd_runs_in_override():
    ws = _make_ws()
    r = await ws.execute("pwd", cwd="/ram/subdir")
    assert (await r.stdout_str()).strip() == "/ram/subdir"


@pytest.mark.asyncio
async def test_cwd_does_not_mutate_session():
    ws = _make_ws()
    before = ws.get_session(DEFAULT_SESSION_ID).cwd
    await ws.execute("pwd", cwd="/ram/subdir")
    after = ws.get_session(DEFAULT_SESSION_ID).cwd
    assert before == after


@pytest.mark.asyncio
async def test_cwd_cd_does_not_leak():
    ws = _make_ws()
    before = ws.get_session(DEFAULT_SESSION_ID).cwd
    await ws.execute("cd /ram/subdir", cwd="/ram")
    after = ws.get_session(DEFAULT_SESSION_ID).cwd
    assert before == after


@pytest.mark.asyncio
async def test_cwd_parallel_isolation():
    ws = _make_ws()
    r1, r2 = await asyncio.gather(
        ws.execute("pwd", cwd="/ram/subdir"),
        ws.execute("pwd", cwd="/ram/other"),
    )
    assert (await r1.stdout_str()).strip() == "/ram/subdir"
    assert (await r2.stdout_str()).strip() == "/ram/other"


@pytest.mark.asyncio
async def test_setup_persists_overrides_inherit():
    ws = _make_ws()
    await ws.execute("export DEBUG=1")
    assert ws.get_session(DEFAULT_SESSION_ID).env.get("DEBUG") == "1"
    before_cwd = ws.get_session(DEFAULT_SESSION_ID).cwd
    r = await ws.execute("printenv DEBUG", cwd="/ram/subdir")
    assert (await r.stdout_str()).strip() == "1"
    assert ws.get_session(DEFAULT_SESSION_ID).cwd == before_cwd
    assert ws.get_session(DEFAULT_SESSION_ID).env.get("DEBUG") == "1"


@pytest.mark.asyncio
async def test_function_definitions_do_not_leak():
    ws = _make_ws()
    await ws.execute("greet() { echo hi; }", cwd="/ram/subdir")
    session = ws.get_session(DEFAULT_SESSION_ID)
    assert "greet" not in session.functions


# ── env tests ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_env_exposes_override():
    ws = _make_ws()
    r = await ws.execute("printenv FOO", env={"FOO": "bar"})
    assert r.exit_code == 0
    assert (await r.stdout_str()).strip() == "bar"


@pytest.mark.asyncio
async def test_env_does_not_mutate_session():
    ws = _make_ws()
    before = dict(ws.get_session(DEFAULT_SESSION_ID).env)
    await ws.execute("printenv FOO", env={"FOO": "bar"})
    after = dict(ws.get_session(DEFAULT_SESSION_ID).env)
    assert before == after


@pytest.mark.asyncio
async def test_env_export_does_not_leak():
    ws = _make_ws()
    await ws.execute("export LEAKED=yes", env={"FOO": "bar"})
    assert "LEAKED" not in ws.get_session(DEFAULT_SESSION_ID).env


@pytest.mark.asyncio
async def test_env_layers_onto_session():
    ws = _make_ws()
    await ws.execute("export BASE=keep")
    assert ws.get_session(DEFAULT_SESSION_ID).env.get("BASE") == "keep"
    r_base = await ws.execute("printenv BASE", env={"FOO": "bar"})
    assert (await r_base.stdout_str()).strip() == "keep"
    r_foo = await ws.execute("printenv FOO", env={"FOO": "bar"})
    assert (await r_foo.stdout_str()).strip() == "bar"
    session_env = ws.get_session(DEFAULT_SESSION_ID).env
    assert session_env.get("BASE") == "keep"
    assert "FOO" not in session_env


@pytest.mark.asyncio
async def test_env_parallel_isolation():
    ws = _make_ws()
    r1, r2 = await asyncio.gather(
        ws.execute("printenv FOO", env={"FOO": "one"}),
        ws.execute("printenv FOO", env={"FOO": "two"}),
    )
    assert (await r1.stdout_str()).strip() == "one"
    assert (await r2.stdout_str()).strip() == "two"
