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

from unittest.mock import AsyncMock, patch

import pytest

from mirage.accessor.telegram import TelegramAccessor
from mirage.cache.index import IndexEntry
from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.core.telegram.read import read
from mirage.resource.telegram.config import TelegramConfig
from mirage.types import PathSpec


@pytest.fixture
def accessor():
    return TelegramAccessor(config=TelegramConfig(token="test-token"))


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.mark.asyncio
async def test_read_history(accessor, index):
    await index.put(
        "/groups/My Group__-100",
        IndexEntry(id="-100", name="My Group",
                   resource_type="telegram/groups"),
    )

    with patch(
            "mirage.core.telegram.read.get_updates_for_chat",
            new_callable=AsyncMock,
            return_value=b'{"text":"hello"}\n',
    ):
        result = await read(
            accessor,
            PathSpec(original="/groups/My Group__-100/2026-04-11.jsonl",
                     directory="/groups/My Group__-100/2026-04-11.jsonl"),
            index)

    assert b"hello" in result


@pytest.mark.asyncio
async def test_read_not_found(accessor, index):
    with pytest.raises(FileNotFoundError):
        await read(accessor,
                   PathSpec(original="/nonexistent", directory="/nonexistent"),
                   index)
