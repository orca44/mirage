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

from collections.abc import AsyncIterator

import pytest

from mirage.commands.builtin.github.cat import cat
from mirage.commands.builtin.github.head import head
from mirage.commands.builtin.github.tail import tail
from mirage.types import PathSpec
from tests.fixtures.github_mock import MOCK_BLOBS


@pytest.fixture(autouse=True)
def _patch_read(monkeypatch):

    async def _read_bytes(config, owner, repo, sha):
        return MOCK_BLOBS[sha]

    monkeypatch.setattr("mirage.core.github.read.read_bytes", _read_bytes)


def _scope(path: str) -> PathSpec:
    norm = "/" + path.lstrip("/")
    directory = norm.rsplit("/", 1)[0] + "/"
    return PathSpec(original=norm, directory=directory, resolved=True)


@pytest.mark.asyncio
async def test_cat_returns_async_iterator(github_env):
    accessor, index = github_env
    stdout, io = await cat(accessor, [_scope("README.md")], index=index)
    assert isinstance(stdout, AsyncIterator)


@pytest.mark.asyncio
async def test_head_returns_async_iterator(github_env):
    accessor, index = github_env
    stdout, io = await head(accessor, [_scope("README.md")], index=index)
    assert isinstance(stdout, AsyncIterator)


@pytest.mark.asyncio
async def test_tail_returns_async_iterator(github_env):
    accessor, index = github_env
    stdout, io = await tail(accessor, [_scope("README.md")], index=index)
    assert isinstance(stdout, AsyncIterator)


@pytest.mark.asyncio
async def test_cat_chunk_by_chunk(github_env):
    accessor, index = github_env
    stdout, io = await cat(accessor, [_scope("src/utils.py")], index=index)
    chunks = []
    async for chunk in stdout:
        chunks.append(chunk)
    assert len(chunks) >= 1
    full = b"".join(chunks)
    assert full == MOCK_BLOBS["bbb333"]
