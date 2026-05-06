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

from mirage.accessor.gslides import GSlidesAccessor
from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.ops import Ops
from mirage.ops.config import OpsMount
from mirage.ops.gslides import OPS as GSLIDES_OPS
from mirage.types import MountMode


def _make_gslides_ops():
    accessor = GSlidesAccessor(config=None, token_manager=None)
    ops_list = []
    for fn in GSLIDES_OPS:
        if hasattr(fn, "_registered_ops"):
            ops_list.extend(fn._registered_ops)
    mount = OpsMount(
        prefix="/gslides/",
        resource_type="gslides",
        accessor=accessor,
        index=RAMIndexCacheStore(),
        mode=MountMode.READ,
        ops=ops_list,
    )
    return Ops([mount])


@pytest.mark.asyncio
async def test_readdir():
    ops = _make_gslides_ops()
    with patch(
            "mirage.ops.gslides.readdir.core_readdir",
            new_callable=AsyncMock,
            return_value=["/gslides/owned/deck.gslide.json"],
    ):
        result = await ops.readdir("/gslides/owned")
        assert "/gslides/owned/deck.gslide.json" in result


@pytest.mark.asyncio
async def test_read_presentation():
    ops = _make_gslides_ops()
    pres_json = json.dumps({"presentationId": "slide1"}).encode()
    with patch(
            "mirage.ops.gslides.read.core_read",
            new_callable=AsyncMock,
            return_value=pres_json,
    ):
        result = await ops.read("/gslides/owned/deck.gslide.json")
        parsed = json.loads(result)
        assert parsed["presentationId"] == "slide1"
