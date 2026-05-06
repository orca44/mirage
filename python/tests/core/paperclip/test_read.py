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

from unittest.mock import AsyncMock

import pytest

from mirage.accessor.paperclip import PaperclipAccessor
from mirage.core.paperclip.read import read
from mirage.types import PathSpec


@pytest.fixture
def accessor():
    acc = PaperclipAccessor.__new__(PaperclipAccessor)
    acc.execute = AsyncMock()
    return acc


def _make_path(virtual_path: str) -> PathSpec:
    return PathSpec(original=virtual_path, directory=virtual_path)


@pytest.mark.asyncio
async def test_read_meta_json(accessor):
    accessor.execute.return_value = {
        "output": '{"title": "My Paper", "doi": "10.1234/test"}',
    }
    result = await read(accessor,
                        _make_path("/biorxiv/2024/03/bio_abc123/meta.json"))

    assert isinstance(result, bytes)
    assert b'"title"' in result
    assert b"My Paper" in result
    accessor.execute.assert_called_once_with("cat",
                                             "/papers/bio_abc123/meta.json")


@pytest.mark.asyncio
async def test_read_content_lines(accessor):
    accessor.execute.return_value = {
        "output": "1: Introduction\n2: Methods\n3: Results",
    }
    result = await read(
        accessor, _make_path("/biorxiv/2024/03/bio_abc123/content.lines"))

    assert isinstance(result, bytes)
    assert b"Introduction" in result
    assert b"Methods" in result
    accessor.execute.assert_called_once_with(
        "cat", "/papers/bio_abc123/content.lines")


@pytest.mark.asyncio
async def test_read_section_file(accessor):
    accessor.execute.return_value = {
        "output": "We performed RNA-seq analysis...",
    }
    result = await read(
        accessor,
        _make_path("/pmc/2024/03/PMC123/sections/Methods.lines"),
    )

    assert isinstance(result, bytes)
    assert b"RNA-seq" in result
    accessor.execute.assert_called_once_with(
        "cat", "/papers/PMC123/sections/Methods.lines")


@pytest.mark.asyncio
async def test_read_not_in_paper_raises(accessor):
    with pytest.raises(FileNotFoundError):
        await read(accessor, _make_path("/biorxiv"))


@pytest.mark.asyncio
async def test_read_invalid_source_raises(accessor):
    with pytest.raises(FileNotFoundError):
        await read(accessor, _make_path("/unknown/2024/03/id/file"))
