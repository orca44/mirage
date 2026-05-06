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
from bson import ObjectId

from mirage.accessor.mongodb import MongoDBAccessor
from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.core.mongodb.read import read
from mirage.resource.mongodb.config import MongoDBConfig
from mirage.types import PathSpec


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.fixture
def accessor():
    config = MongoDBConfig(uri="mongodb://localhost:27017",
                           default_doc_limit=10)
    return MongoDBAccessor(config=config)


@pytest.mark.asyncio
async def test_read_collection_returns_jsonl(accessor, index):
    oid = ObjectId()
    docs = [
        {
            "_id": oid,
            "title": "Movie 1"
        },
        {
            "_id": ObjectId(),
            "title": "Movie 2"
        },
    ]
    with patch(
            "mirage.core.mongodb.read.find_documents",
            new_callable=AsyncMock,
            return_value=docs,
    ):
        result = await read(
            accessor,
            PathSpec(original="/sample_mflix/movies.jsonl",
                     directory="/sample_mflix/movies.jsonl"), index)

    lines = result.decode().strip().split("\n")
    assert len(lines) == 2
    first = json.loads(lines[0])
    assert first["title"] == "Movie 1"
    assert first["_id"] == str(oid)


@pytest.mark.asyncio
async def test_read_returns_limited_docs(accessor, index):
    docs = [{"_id": ObjectId(), "x": i} for i in range(10)]
    with patch(
            "mirage.core.mongodb.read.find_documents",
            new_callable=AsyncMock,
            return_value=docs,
    ):
        result = await read(
            accessor,
            PathSpec(original="/sample_mflix/movies.jsonl",
                     directory="/sample_mflix/movies.jsonl"), index)

    lines = result.decode().strip().split("\n")
    assert len(lines) == 10
    for line in lines:
        parsed = json.loads(line)
        assert isinstance(parsed["_id"], str)


@pytest.mark.asyncio
async def test_read_id_converted_to_string(accessor, index):
    oid = ObjectId()
    docs = [{"_id": oid, "name": "test"}]
    with patch(
            "mirage.core.mongodb.read.find_documents",
            new_callable=AsyncMock,
            return_value=docs,
    ):
        result = await read(
            accessor,
            PathSpec(original="/sample_mflix/movies.jsonl",
                     directory="/sample_mflix/movies.jsonl"), index)

    line = json.loads(result.decode().strip())
    assert isinstance(line["_id"], str)
    assert line["_id"] == str(oid)


@pytest.mark.asyncio
async def test_read_empty_collection(accessor, index):
    with patch(
            "mirage.core.mongodb.read.find_documents",
            new_callable=AsyncMock,
            return_value=[],
    ):
        result = await read(
            accessor,
            PathSpec(original="/sample_mflix/movies.jsonl",
                     directory="/sample_mflix/movies.jsonl"), index)

    assert result == b""


@pytest.mark.asyncio
async def test_read_invalid_path_raises(accessor, index):
    with pytest.raises(FileNotFoundError):
        await read(
            accessor,
            PathSpec(original="/not_a_jsonl_file",
                     directory="/not_a_jsonl_file"), index)
