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

from mirage.commands.builtin.du_helper import du as du_helper
from mirage.commands.builtin.find_helper import find as find_helper
from mirage.commands.builtin.grep_helper import compile_pattern, grep_recursive
from mirage.commands.builtin.ls_helper import ls as ls_helper
from mirage.commands.builtin.rg_helper import rg_full
from mirage.commands.builtin.tree_helper import tree as tree_helper
from mirage.resource.ram import RAMResource
from mirage.types import FileStat, FileType, MountMode, PathSpec
from mirage.workspace import Workspace


def _make_readdir(tree):

    def readdir(path):
        if path in tree:
            return tree[path]
        raise FileNotFoundError(path)

    return readdir


def _make_stat(files):

    def stat_fn(path):
        if path in files:
            return files[path]
        raise FileNotFoundError(path)

    return stat_fn


def test_find_helper_collects_warnings_on_missing_entry():
    readdir = _make_readdir({
        "/": ["/a", "/b"],
        "/a": ["/a/file1"],
    })
    stat_fn = _make_stat({
        "/a":
        FileStat(name="a", size=0, modified=None, type=FileType.DIRECTORY),
        "/a/file1":
        FileStat(name="file1", size=10, modified=None, type=FileType.TEXT),
    })
    warnings: list[str] = []
    results = find_helper(readdir, stat_fn, "/", warnings=warnings)
    assert "/a" in results
    assert "/a/file1" in results
    assert len(warnings) == 1
    assert "/b" in warnings[0]


def test_find_helper_no_warnings_when_none():
    readdir = _make_readdir({"/": ["/a"]})
    stat_fn = _make_stat({})
    results = find_helper(readdir, stat_fn, "/")
    assert results == []


@pytest.mark.anyio
async def test_grep_helper_collects_warnings_on_unreadable_file():

    async def read_bytes(path):
        if path == "/good.txt":
            return b"hello world\n"
        raise FileNotFoundError(path)

    readdir = _make_readdir({"/": ["/good.txt", "/bad.txt"]})
    stat_fn = _make_stat({
        "/good.txt":
        FileStat(name="good.txt", size=12, modified=None, type=FileType.TEXT),
        "/bad.txt":
        FileStat(name="bad.txt", size=10, modified=None, type=FileType.TEXT),
    })

    async def async_readdir(path):
        return readdir(path)

    async def async_stat(path):
        return stat_fn(path)

    warnings: list[str] = []
    compiled = compile_pattern("hello")
    results = await grep_recursive(
        async_readdir,
        async_stat,
        read_bytes,
        "/",
        compiled,
        invert=False,
        line_numbers=False,
        count_only=False,
        files_only=False,
        only_matching=False,
        max_count=None,
        warnings=warnings,
    )
    assert any("hello" in r for r in results)
    assert len(warnings) == 1
    assert "/bad.txt" in warnings[0]


@pytest.mark.anyio
async def test_grep_helper_warns_on_missing_dir():

    async def read_bytes(path):
        raise FileNotFoundError(path)

    readdir = _make_readdir({})

    async def async_readdir(path):
        return readdir(path)

    async def async_stat(path):
        raise FileNotFoundError(path)

    warnings: list[str] = []
    compiled = compile_pattern("pattern")
    results = await grep_recursive(
        async_readdir,
        async_stat,
        read_bytes,
        "/missing",
        compiled,
        invert=False,
        line_numbers=False,
        count_only=False,
        files_only=False,
        only_matching=False,
        max_count=None,
        warnings=warnings,
    )
    assert results == []
    assert len(warnings) >= 1
    assert "/missing" in warnings[0]


@pytest.mark.anyio
async def test_rg_helper_collects_warnings_on_unreadable_file():

    async def read_bytes(path):
        if path == "/good.py":
            return b"hello world\n"
        raise FileNotFoundError(path)

    readdir = _make_readdir({"/": ["/good.py", "/bad.py"]})
    stat_fn = _make_stat({
        "/good.py":
        FileStat(name="good.py", size=12, modified=None, type=FileType.TEXT),
        "/bad.py":
        FileStat(name="bad.py", size=10, modified=None, type=FileType.TEXT),
    })

    async def async_readdir(path):
        return readdir(path)

    async def async_stat(path):
        return stat_fn(path)

    warnings: list[str] = []
    results = await rg_full(
        async_readdir,
        async_stat,
        read_bytes,
        "/",
        "hello",
        ignore_case=False,
        invert=False,
        line_numbers=True,
        count_only=False,
        files_only=False,
        fixed_string=False,
        only_matching=False,
        max_count=None,
        whole_word=False,
        context_before=0,
        context_after=0,
        file_type=None,
        glob_pattern=None,
        hidden=False,
        warnings=warnings,
    )
    assert any("hello" in r for r in results)
    assert len(warnings) == 1
    assert "/bad.py" in warnings[0]


def test_tree_helper_collects_warnings_on_missing_entry():
    readdir = _make_readdir({"/": ["/a", "/b"], "/a": []})
    stat_fn = _make_stat({
        "/a":
        FileStat(name="a", size=0, modified=None, type=FileType.DIRECTORY),
    })
    warnings: list[str] = []
    tree_helper(readdir, stat_fn, "/", warnings=warnings)
    assert len(warnings) == 1
    assert "/b" in warnings[0]


def test_du_helper_collects_warnings_on_missing_path():
    readdir = _make_readdir({"/": ["/a"]})
    stat_fn = _make_stat({
        "/":
        FileStat(name="/", size=0, modified=None, type=FileType.DIRECTORY),
    })
    warnings: list[str] = []
    total = du_helper(readdir, stat_fn, "/", warnings=warnings)
    assert total == 0
    assert len(warnings) >= 1
    assert "/a" in warnings[0]


def test_ls_helper_collects_warnings_on_stat_failure():
    readdir = _make_readdir({"/": ["/a", "/b"]})
    stat_fn = _make_stat({
        "/a":
        FileStat(name="a", size=10, modified=None, type=FileType.TEXT),
    })
    warnings: list[str] = []
    entries = ls_helper(readdir, stat_fn, "/", warnings=warnings)
    assert len(entries) == 1
    assert entries[0].name == "a"
    assert len(warnings) == 1
    assert "/b" in warnings[0]


async def _seed_ws(ws):
    await ws.dispatch("mkdir", PathSpec.from_str_path("/data"))
    await ws.dispatch("write",
                      PathSpec.from_str_path("/data/hello.txt"),
                      data=b"hello world\nfoo bar\n")


def _ws():
    ws = Workspace({"/": RAMResource()}, mode=MountMode.WRITE)
    asyncio.run(_seed_ws(ws))
    return ws


def test_find_command_stderr_on_missing_dir():
    ws = _ws()

    async def _run():
        result = await ws.execute("find /nonexistent")
        assert result.exit_code == 1
        assert b"nonexistent" in await result.materialize_stderr()

    asyncio.run(_run())


def test_grep_command_stderr_on_missing_file():
    ws = _ws()

    async def _run():
        result = await ws.execute("grep hello /nonexistent")
        assert result.exit_code == 1
        assert b"nonexistent" in await result.materialize_stderr()

    asyncio.run(_run())


def test_ls_command_stderr_on_missing_dir():
    ws = _ws()

    async def _run():
        result = await ws.execute("ls /nonexistent")
        assert result.exit_code == 1
        assert b"nonexistent" in await result.materialize_stderr()

    asyncio.run(_run())
