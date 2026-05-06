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

import io

import pandas as pd
import pyarrow as pa
import pyarrow.feather as feather
import pyarrow.orc as orc
import pyarrow.parquet as pq
import pytest

from mirage.resource.ram import RAMResource
from mirage.types import MountMode
from mirage.workspace import Workspace


def _make_parquet() -> bytes:
    df = pd.DataFrame({"name": ["alice", "bob"], "score": [95, 80]})
    buf = io.BytesIO()
    pq.write_table(pa.Table.from_pandas(df), buf)
    return buf.getvalue()


def _make_orc() -> bytes:
    df = pd.DataFrame({"name": ["alice", "bob"], "score": [95, 80]})
    buf = io.BytesIO()
    orc.write_table(pa.Table.from_pandas(df), buf)
    return buf.getvalue()


def _make_feather() -> bytes:
    df = pd.DataFrame({"name": ["alice", "bob"], "score": [95, 80]})
    buf = io.BytesIO()
    feather.write_feather(pa.Table.from_pandas(df), buf)
    return buf.getvalue()


async def _ws_with_files(**files):
    ws = Workspace(
        {"/data/": RAMResource()},
        mode=MountMode.WRITE,
    )
    for path, data in files.items():
        await ws.ops.write(path, data)
    return ws


@pytest.mark.asyncio
async def test_cat_parquet_returns_text():
    ws = await _ws_with_files(**{"/data/test.parquet": _make_parquet()})
    ws._cwd = "/"
    io = await ws.execute("cat /data/test.parquet")
    out = await io.stdout_str()
    assert "alice" in out
    assert "name" in out
    assert "score" in out


@pytest.mark.asyncio
async def test_cat_orc_returns_text():
    ws = await _ws_with_files(**{"/data/test.orc": _make_orc()})
    ws._cwd = "/"
    io = await ws.execute("cat /data/test.orc")
    assert "alice" in (await io.stdout_str())


@pytest.mark.asyncio
async def test_cat_feather_returns_text():
    ws = await _ws_with_files(**{"/data/test.feather": _make_feather()})
    ws._cwd = "/"
    io = await ws.execute("cat /data/test.feather")
    assert "alice" in (await io.stdout_str())


@pytest.mark.asyncio
async def test_cat_txt_unchanged():
    ws = await _ws_with_files(**{"/data/test.txt": b"hello world"})
    ws._cwd = "/"
    io = await ws.execute("cat /data/test.txt")
    assert (await io.stdout_str()) == "hello world"


@pytest.mark.asyncio
async def test_filetype_priority_over_generic():
    ws = await _ws_with_files(**{"/data/test.parquet": _make_parquet()})
    ws._cwd = "/"
    io = await ws.execute("cat /data/test.parquet")
    out = await io.stdout_str()
    assert "Schema" in out or "name:" in out
