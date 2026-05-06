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

from mirage.accessor.telegram import TelegramAccessor
from mirage.cache.index import IndexEntry
from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.core.telegram.stat import stat
from mirage.resource.telegram.config import TelegramConfig
from mirage.types import FileType, PathSpec


@pytest.fixture
def accessor():
    return TelegramAccessor(config=TelegramConfig(token="test-token"))


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.mark.asyncio
async def test_stat_root(accessor, index):
    s = await stat(accessor, PathSpec(original="/", directory="/"), index)
    assert s.type == FileType.DIRECTORY


@pytest.mark.asyncio
async def test_stat_category(accessor, index):
    s = await stat(accessor, PathSpec(original="/groups", directory="/groups"),
                   index)
    assert s.type == FileType.DIRECTORY
    assert s.name == "groups"


@pytest.mark.asyncio
async def test_stat_chat(accessor, index):
    await index.put(
        "/groups/My Group__-100",
        IndexEntry(id="-100",
                   name="My Group",
                   resource_type="telegram/groups",
                   vfs_name="My Group__-100"),
    )

    s = await stat(
        accessor,
        PathSpec(original="/groups/My Group__-100",
                 directory="/groups/My Group__-100"), index)
    assert s.type == FileType.DIRECTORY
    assert s.extra["chat_id"] == "-100"


@pytest.mark.asyncio
async def test_stat_file(accessor, index):
    s = await stat(
        accessor,
        PathSpec(original="/groups/My Group__-100/2026-04-11.jsonl",
                 directory="/groups/My Group__-100/2026-04-11.jsonl"), index)
    assert s.type == FileType.TEXT
