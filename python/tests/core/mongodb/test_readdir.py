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

from mirage.accessor.mongodb import MongoDBAccessor
from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.core.mongodb.readdir import readdir
from mirage.resource.mongodb.config import MongoDBConfig
from mirage.types import PathSpec


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.fixture
def accessor():
    config = MongoDBConfig(uri="mongodb://localhost:27017")
    return MongoDBAccessor(config=config)


@pytest.fixture
def single_db_accessor():
    config = MongoDBConfig(uri="mongodb://localhost:27017", databases=["mydb"])
    return MongoDBAccessor(config=config)


@pytest.mark.asyncio
async def test_readdir_root_lists_databases(accessor, index):
    with patch(
            "mirage.core.mongodb.readdir.list_databases",
            new_callable=AsyncMock,
            return_value=["db1", "db2"],
    ):
        result = await readdir(accessor, PathSpec(original="/", directory="/"),
                               index)

    assert "/db1" in result
    assert "/db2" in result


@pytest.mark.asyncio
async def test_readdir_database_lists_collections(accessor, index):
    with patch(
            "mirage.core.mongodb.readdir.list_collections",
            new_callable=AsyncMock,
            return_value=["movies", "users"],
    ):
        result = await readdir(
            accessor,
            PathSpec(original="/sample_mflix", directory="/sample_mflix"),
            index)

    assert "/sample_mflix/movies.jsonl" in result
    assert "/sample_mflix/users.jsonl" in result


@pytest.mark.asyncio
async def test_readdir_single_db_mode(single_db_accessor, index):
    with patch(
            "mirage.core.mongodb.readdir.list_collections",
            new_callable=AsyncMock,
            return_value=["movies", "users"],
    ):
        result = await readdir(single_db_accessor,
                               PathSpec(original="/", directory="/"), index)

    assert "/movies.jsonl" in result
    assert "/users.jsonl" in result


@pytest.mark.asyncio
async def test_readdir_index_caching(accessor, index):
    mock_list_db = AsyncMock(return_value=["db1", "db2"])
    with patch(
            "mirage.core.mongodb.readdir.list_databases",
            new_callable=AsyncMock,
            side_effect=mock_list_db,
    ):
        first = await readdir(accessor, PathSpec(original="/", directory="/"),
                              index)
    second = await readdir(accessor, PathSpec(original="/", directory="/"),
                           index)

    assert first == second
    assert mock_list_db.call_count == 1


@pytest.mark.asyncio
async def test_readdir_nested_path_raises(accessor, index):
    with pytest.raises(FileNotFoundError):
        await readdir(
            accessor,
            PathSpec(original="/db/col/extra", directory="/db/col/extra"),
            index)
