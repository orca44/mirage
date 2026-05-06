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

from mirage.accessor.gmail import GmailAccessor
from mirage.cache.index import IndexEntry, RAMIndexCacheStore
from mirage.commands.builtin.gmail.cat import cat
from mirage.types import PathSpec


@pytest.fixture
def accessor():
    return GmailAccessor(config=None, token_manager=None)


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.mark.asyncio
async def test_cat_reads_message(accessor, index):
    await index.set_dir("/gmail/INBOX/2026-04-12", [
        ("Test_Email__msg1.gmail.json",
         IndexEntry(
             id="msg1",
             name="Test Email",
             resource_type="gmail/message",
             vfs_name="Test_Email__msg1.gmail.json",
         )),
    ])
    processed = {"id": "msg1", "subject": "Test Email", "body_text": "Hello!"}
    with patch(
            "mirage.core.gmail.read.get_message_processed",
            new_callable=AsyncMock,
            return_value=processed,
    ):
        path = PathSpec(
            original="/gmail/INBOX/2026-04-12/Test_Email__msg1.gmail.json",
            directory="/gmail/INBOX/2026-04-12",
            prefix="/gmail",
            resolved=True,
        )
        result_val, io = await cat(accessor, [path], index=index)
        if isinstance(result_val, bytes):
            result = json.loads(result_val)
        else:
            chunks = []
            async for chunk in result_val:
                chunks.append(chunk)
            result = json.loads(b"".join(chunks))
        assert result["id"] == "msg1"


@pytest.mark.asyncio
async def test_cat_not_found(accessor, index):
    path = PathSpec(
        original="/gmail/INBOX/nonexistent.gmail.json",
        directory="/gmail/INBOX",
        prefix="/gmail",
        resolved=True,
    )
    with pytest.raises(FileNotFoundError):
        await cat(accessor, [path], index=index)
