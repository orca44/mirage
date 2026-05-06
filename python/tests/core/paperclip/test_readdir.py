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

from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.core.paperclip.readdir import YEARS, _build_month_sql, readdir
from mirage.resource.paperclip.config import PaperclipConfig
from mirage.types import PathSpec

SQL_OUTPUT = """\
id                                   | title
-------------------------------------+-------------------------------
fb37af04-6c0e-1014-9fac-9ce395c656a4 | CRISPR base editing in vivo
fb38c6a3-771e-1014-9681-9dd49822ec48 | AAV delivery optimization
(2 rows, 14ms) [bioRxiv (2 rows)]
"""

LS_OUTPUT = ("meta.json  content.lines  (1271 lines)"
             "  sections/  supplements/  figures/\n"
             "  (read-only — use /.gxl/ for writable storage)")

SECTIONS_LS_OUTPUT = "introduction  methods  results  discussion"


@pytest.fixture()
def accessor():
    acc = AsyncMock()
    acc.config = PaperclipConfig(default_limit=500)
    return acc


@pytest.fixture()
def index():
    return RAMIndexCacheStore(ttl=600)


def _path(original: str, prefix: str = "/paperclip") -> PathSpec:
    return PathSpec(original=original, directory=original, prefix=prefix)


@pytest.mark.asyncio
async def test_readdir_root(accessor, index):
    result = await readdir(accessor, _path("/paperclip"), index)
    assert result == [
        "/paperclip/arxiv",
        "/paperclip/biorxiv",
        "/paperclip/medrxiv",
        "/paperclip/pmc",
    ]


@pytest.mark.asyncio
async def test_readdir_source(accessor, index):
    result = await readdir(accessor, _path("/paperclip/biorxiv"), index)
    assert len(result) == len(YEARS)
    assert result[0] == "/paperclip/biorxiv/2020"
    assert result[-1] == f"/paperclip/biorxiv/{YEARS[-1]}"


@pytest.mark.asyncio
async def test_readdir_source_year(accessor, index):
    result = await readdir(accessor, _path("/paperclip/medrxiv/2024"), index)
    assert len(result) == 12
    assert result[0] == "/paperclip/medrxiv/2024/01"
    assert result[-1] == "/paperclip/medrxiv/2024/12"


@pytest.mark.asyncio
async def test_readdir_source_year_month_papers(accessor, index):
    accessor.execute.return_value = {"output": SQL_OUTPUT}
    result = await readdir(accessor, _path("/paperclip/biorxiv/2024/03"),
                           index)
    accessor.execute.assert_called_once()
    call_args = accessor.execute.call_args
    assert call_args[0][0] == "sql"
    assert "biorxiv" in call_args[0][1]
    assert "March_2024" in call_args[0][1]
    assert len(result) == 2
    assert result[0] == "/paperclip/biorxiv/2024/03/bio_fb37af046c0e"
    assert result[1] == "/paperclip/biorxiv/2024/03/bio_fb38c6a3771e"


@pytest.mark.asyncio
async def test_readdir_paper_dir(accessor, index):
    accessor.execute.return_value = {"output": LS_OUTPUT}
    result = await readdir(
        accessor,
        _path("/paperclip/biorxiv/2024/03/bio_fb37af046c0e"),
        index,
    )
    accessor.execute.assert_called_once_with("ls", "/papers/bio_fb37af046c0e/")
    base = "/paperclip/biorxiv/2024/03/bio_fb37af046c0e"
    assert f"{base}/meta.json" in result
    assert f"{base}/content.lines" in result
    assert "/paperclip/biorxiv/2024/03/bio_fb37af046c0e/sections" in result
    assert "/paperclip/biorxiv/2024/03/bio_fb37af046c0e/figures" in result
    assert "/paperclip/biorxiv/2024/03/bio_fb37af046c0e/supplements" in result


@pytest.mark.asyncio
async def test_readdir_paper_subdir(accessor, index):
    accessor.execute.return_value = {"output": SECTIONS_LS_OUTPUT}
    result = await readdir(
        accessor,
        _path("/paperclip/biorxiv/2024/03/bio_fb37af046c0e/sections"),
        index,
    )
    accessor.execute.assert_called_once_with(
        "ls", "/papers/bio_fb37af046c0e/sections/")
    assert len(result) == 4
    base = "/paperclip/biorxiv/2024/03/bio_fb37af046c0e"
    assert f"{base}/sections/introduction" in result


@pytest.mark.asyncio
async def test_readdir_root_cached(accessor, index):
    await readdir(accessor, _path("/paperclip"), index)
    result = await readdir(accessor, _path("/paperclip"), index)
    assert len(result) == 4


@pytest.mark.asyncio
async def test_readdir_pmc_sql(accessor, index):
    pmc_sql_output = """\
id         | title
-----------+------
PMC9969233 | Some PMC paper
(1 row, 5ms)
"""
    accessor.execute.return_value = {"output": pmc_sql_output}
    result = await readdir(accessor, _path("/paperclip/pmc/2024/03"), index)
    call_args = accessor.execute.call_args
    sql = call_args[0][1]
    assert "pmc_id AS id" in sql
    assert "received_date >= '2024-03-01'" in sql
    assert "received_date < '2024-04-01'" in sql
    assert len(result) == 1
    assert result[0] == "/paperclip/pmc/2024/03/PMC9969233"


@pytest.mark.asyncio
async def test_readdir_pmc_december_boundary(accessor, index):
    pmc_sql_output = """\
id         | title
-----------+------
PMC1234567 | Dec paper
(1 row, 3ms)
"""
    accessor.execute.return_value = {"output": pmc_sql_output}
    await readdir(accessor, _path("/paperclip/pmc/2024/12"), index)
    sql = accessor.execute.call_args[0][1]
    assert "received_date < '2025-01-01'" in sql


@pytest.mark.asyncio
async def test_build_month_sql_biorxiv():
    sql = _build_month_sql("biorxiv", "2024", "03", 500)
    assert "source = 'biorxiv'" in sql
    assert "month_year = 'March_2024'" in sql
    assert "LIMIT 500" in sql


@pytest.mark.asyncio
async def test_build_month_sql_medrxiv():
    sql = _build_month_sql("medrxiv", "2023", "11", 100)
    assert "source = 'medrxiv'" in sql
    assert "month_year = 'November_2023'" in sql
    assert "LIMIT 100" in sql


@pytest.mark.asyncio
async def test_build_month_sql_pmc():
    sql = _build_month_sql("pmc", "2024", "06", 500)
    assert "source = 'pmc'" in sql
    assert "received_date >= '2024-06-01'" in sql
    assert "received_date < '2024-07-01'" in sql
