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

import pytest

from mirage.core.paperclip.stat import stat
from mirage.types import FileType, PathSpec


@pytest.fixture
def accessor():
    return object()


@pytest.mark.asyncio
async def test_stat_root(accessor):
    result = await stat(accessor, PathSpec(original="/", directory="/"))
    assert result.type == FileType.DIRECTORY
    assert result.name == "/"


@pytest.mark.asyncio
async def test_stat_source(accessor):
    result = await stat(accessor,
                        PathSpec(original="/biorxiv", directory="/biorxiv"))
    assert result.type == FileType.DIRECTORY
    assert result.name == "biorxiv"


@pytest.mark.asyncio
async def test_stat_year(accessor):
    result = await stat(accessor,
                        PathSpec(original="/pmc/2024", directory="/pmc/2024"))
    assert result.type == FileType.DIRECTORY
    assert result.name == "2024"


@pytest.mark.asyncio
async def test_stat_month(accessor):
    result = await stat(
        accessor,
        PathSpec(original="/biorxiv/2024/03", directory="/biorxiv/2024/03"))
    assert result.type == FileType.DIRECTORY
    assert result.name == "03"


@pytest.mark.asyncio
async def test_stat_paper_dir(accessor):
    result = await stat(
        accessor,
        PathSpec(original="/biorxiv/2024/03/bio_abc123",
                 directory="/biorxiv/2024/03/bio_abc123"))
    assert result.type == FileType.DIRECTORY
    assert result.name == "bio_abc123"


@pytest.mark.asyncio
async def test_stat_meta_json(accessor):
    result = await stat(
        accessor,
        PathSpec(original="/biorxiv/2024/03/bio_abc123/meta.json",
                 directory="/biorxiv/2024/03/bio_abc123"))
    assert result.type == FileType.JSON
    assert result.name == "meta.json"


@pytest.mark.asyncio
async def test_stat_content_lines(accessor):
    result = await stat(
        accessor,
        PathSpec(
            original="/biorxiv/2024/03/bio_abc123/sections/Introduction.lines",
            directory="/biorxiv/2024/03/bio_abc123/sections"))
    assert result.type == FileType.TEXT
    assert result.name == "Introduction.lines"


@pytest.mark.asyncio
async def test_stat_figure_jpg(accessor):
    result = await stat(
        accessor,
        PathSpec(original="/biorxiv/2024/03/bio_abc123/figures/fig1.jpg",
                 directory="/biorxiv/2024/03/bio_abc123/figures"))
    assert result.type == FileType.IMAGE_JPEG
    assert result.name == "fig1.jpg"


@pytest.mark.asyncio
async def test_stat_figure_tif(accessor):
    result = await stat(
        accessor,
        PathSpec(original="/biorxiv/2024/03/bio_abc123/figures/fig2.tif",
                 directory="/biorxiv/2024/03/bio_abc123/figures"))
    assert result.type == FileType.BINARY
    assert result.name == "fig2.tif"


@pytest.mark.asyncio
async def test_stat_sections_dir(accessor):
    result = await stat(
        accessor,
        PathSpec(original="/biorxiv/2024/03/bio_abc123/sections",
                 directory="/biorxiv/2024/03/bio_abc123"))
    assert result.type == FileType.DIRECTORY
    assert result.name == "sections"


@pytest.mark.asyncio
async def test_stat_unknown_raises(accessor):
    with pytest.raises(FileNotFoundError):
        await stat(accessor,
                   PathSpec(original="/unknown/path", directory="/unknown"))
