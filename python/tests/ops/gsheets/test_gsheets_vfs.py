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

import json
from unittest.mock import AsyncMock, patch

import pytest

from mirage.accessor.gsheets import GSheetsAccessor
from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.ops import Ops
from mirage.ops.config import OpsMount
from mirage.ops.gsheets import OPS as GSHEETS_OPS
from mirage.types import MountMode


def _make_gsheets_ops():
    accessor = GSheetsAccessor(config=None, token_manager=None)
    ops_list = []
    for fn in GSHEETS_OPS:
        if hasattr(fn, "_registered_ops"):
            ops_list.extend(fn._registered_ops)
    mount = OpsMount(
        prefix="/gsheets/",
        resource_type="gsheets",
        accessor=accessor,
        index=RAMIndexCacheStore(),
        mode=MountMode.READ,
        ops=ops_list,
    )
    return Ops([mount])


@pytest.mark.asyncio
async def test_readdir():
    ops = _make_gsheets_ops()
    with patch(
            "mirage.ops.gsheets.readdir.core_readdir",
            new_callable=AsyncMock,
            return_value=["/gsheets/owned/budget.gsheet.json"],
    ):
        result = await ops.readdir("/gsheets/owned")
        assert "/gsheets/owned/budget.gsheet.json" in result


@pytest.mark.asyncio
async def test_read_spreadsheet():
    ops = _make_gsheets_ops()
    sheet_json = json.dumps({"spreadsheetId": "sheet1"}).encode()
    with patch(
            "mirage.ops.gsheets.read.core_read",
            new_callable=AsyncMock,
            return_value=sheet_json,
    ):
        result = await ops.read("/gsheets/owned/budget.gsheet.json")
        parsed = json.loads(result)
        assert parsed["spreadsheetId"] == "sheet1"
