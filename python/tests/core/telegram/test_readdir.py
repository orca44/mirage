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
from mirage.core.telegram.readdir import readdir
from mirage.resource.telegram.config import TelegramConfig
from mirage.types import PathSpec


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.fixture
def accessor():
    return TelegramAccessor(config=TelegramConfig(token="test-token"))


@pytest.mark.asyncio
async def test_readdir_root(accessor, index):
    result = await readdir(accessor, PathSpec(original="/", directory="/"),
                           index)
    assert "/groups" in result
    assert "/channels" in result
    assert "/private" in result


@pytest.mark.asyncio
async def test_readdir_groups(accessor, index):
    chats = [
        {
            "id": -100,
            "type": "group",
            "title": "My Group"
        },
        {
            "id": 42,
            "type": "private",
            "username": "alice"
        },
    ]
    with patch(
            "mirage.core.telegram.readdir.discover_chats",
            new_callable=AsyncMock,
            return_value=chats,
    ):
        result = await readdir(
            accessor, PathSpec(original="/groups", directory="/groups"), index)

    assert len(result) == 1
    assert "/groups/My Group__-100" in result


@pytest.mark.asyncio
async def test_readdir_chat_dates(accessor, index):
    await index.put(
        "/groups/My Group__-100",
        IndexEntry(
            id="-100",
            name="My Group",
            resource_type="telegram/groups",
            vfs_name="My Group__-100",
        ),
    )

    result = await readdir(
        accessor,
        PathSpec(original="/groups/My Group__-100",
                 directory="/groups/My Group__-100"), index)

    assert len(result) == 1
    assert result[0].endswith(".jsonl")
