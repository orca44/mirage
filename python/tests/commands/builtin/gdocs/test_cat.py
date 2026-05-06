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

from mirage.accessor.gdocs import GDocsAccessor
from mirage.cache.index import IndexEntry
from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.commands.builtin.gdocs.cat import cat
from mirage.types import PathSpec


@pytest.fixture
def accessor():
    return GDocsAccessor(config=None, token_manager=None)


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.mark.asyncio
async def test_cat_reads_doc(accessor, index):
    await index.set_dir("/gdocs/owned", [
        ("2026-04-01_My_Doc__doc1.gdoc.json",
         IndexEntry(id="doc1",
                    name="My Doc",
                    resource_type="gdocs/file",
                    vfs_name="2026-04-01_My_Doc__doc1.gdoc.json")),
    ])
    doc_json = {"documentId": "doc1", "title": "My Doc"}
    scope = PathSpec(
        original="/gdocs/owned/2026-04-01_My_Doc__doc1.gdoc.json",
        directory="/gdocs/owned",
        prefix="/gdocs",
    )
    with patch(
            "mirage.commands.builtin.gdocs.cat.gdocs_read",
            new_callable=AsyncMock,
            return_value=json.dumps(doc_json).encode(),
    ):
        with patch(
                "mirage.commands.builtin.gdocs.cat.resolve_glob",
                new_callable=AsyncMock,
                return_value=[scope],
        ):
            fn = cat._registered_commands[0].fn
            stream, io = await fn(accessor, [scope], index=index)
            result = json.loads(stream)
            assert result["documentId"] == "doc1"


@pytest.mark.asyncio
async def test_cat_not_found(accessor, index):
    scope = PathSpec(
        original="/gdocs/owned/nonexistent.gdoc.json",
        directory="/gdocs/owned",
        prefix="/gdocs",
    )
    with patch(
            "mirage.commands.builtin.gdocs.cat.resolve_glob",
            new_callable=AsyncMock,
            return_value=[scope],
    ):
        with patch(
                "mirage.commands.builtin.gdocs.cat.gdocs_read",
                new_callable=AsyncMock,
                side_effect=FileNotFoundError("not found"),
        ):
            fn = cat._registered_commands[0].fn
            with pytest.raises(FileNotFoundError):
                await fn(accessor, [scope], index=index)
