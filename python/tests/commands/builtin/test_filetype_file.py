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


def _make_parquet():
    df = pd.DataFrame({"name": ["alice", "bob"], "score": [95, 80]})
    buf = io.BytesIO()
    pq.write_table(pa.Table.from_pandas(df), buf)
    return buf.getvalue()


def _make_orc():
    df = pd.DataFrame({"name": ["alice", "bob"], "score": [95, 80]})
    buf = io.BytesIO()
    orc.write_table(pa.Table.from_pandas(df), buf)
    return buf.getvalue()


def _make_feather():
    df = pd.DataFrame({"name": ["alice", "bob"], "score": [95, 80]})
    buf = io.BytesIO()
    feather.write_feather(pa.Table.from_pandas(df), buf)
    return buf.getvalue()


async def _ws():
    ws = Workspace(
        {"/data/": RAMResource()},
        mode=MountMode.WRITE,
    )
    await ws.ops.write("/data/test.parquet", _make_parquet())
    await ws.ops.write("/data/test.orc", _make_orc())
    await ws.ops.write("/data/test.feather", _make_feather())
    await ws.ops.write("/data/notes.txt", b"hello world\n")
    return ws


@pytest.mark.asyncio
async def test_file_parquet_shows_metadata():
    ws = await _ws()
    ws._cwd = "/"
    io = await ws.execute("file /data/test.parquet")
    out = await io.stdout_str()
    assert "parquet" in out
    assert "rows" in out
    assert "columns" in out


@pytest.mark.asyncio
async def test_file_orc_shows_metadata():
    ws = await _ws()
    ws._cwd = "/"
    io = await ws.execute("file /data/test.orc")
    out = await io.stdout_str()
    assert "orc" in out
    assert "rows" in out


@pytest.mark.asyncio
async def test_file_feather_shows_metadata():
    ws = await _ws()
    ws._cwd = "/"
    io = await ws.execute("file /data/test.feather")
    out = await io.stdout_str()
    assert "feather" in out
    assert "rows" in out


@pytest.mark.asyncio
async def test_file_txt_unchanged():
    ws = await _ws()
    ws._cwd = "/"
    io = await ws.execute("file /data/notes.txt")
    out = await io.stdout_str()
    assert "text" in out.lower() or "TEXT" in out
