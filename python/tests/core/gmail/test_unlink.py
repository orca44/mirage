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

from mirage.accessor.gmail import GmailAccessor
from mirage.cache.index import IndexEntry
from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.core.gmail.unlink import unlink
from mirage.types import PathSpec


@pytest.fixture
def accessor():
    return GmailAccessor(config=None, token_manager=None)


@pytest.fixture
def index():
    return RAMIndexCacheStore()


@pytest.mark.asyncio
async def test_unlink_message_trashes_message(accessor, index):
    date_path = "/gmail/INBOX/2026-04-27"
    await index.set_dir(date_path, [
        ("Sub__msg1.gmail.json",
         IndexEntry(id="msg1",
                    name="Sub",
                    resource_type="gmail/message",
                    vfs_name="Sub__msg1.gmail.json")),
    ])
    with patch("mirage.core.gmail.unlink.trash_message",
               new_callable=AsyncMock) as mock_trash:
        await unlink(
            accessor,
            PathSpec(original=f"{date_path}/Sub__msg1.gmail.json",
                     directory=f"{date_path}/Sub__msg1.gmail.json",
                     prefix="/gmail"), index)
        mock_trash.assert_awaited_once()
        assert mock_trash.await_args.args[1] == "msg1"


@pytest.mark.asyncio
async def test_unlink_attachment_dir_raises(accessor, index):
    date_path = "/gmail/INBOX/2026-04-27"
    await index.set_dir(date_path, [
        ("Sub__msg1",
         IndexEntry(id="msg1",
                    name="Sub__msg1",
                    resource_type="gmail/attachment_dir",
                    vfs_name="Sub__msg1")),
    ])
    with pytest.raises(IsADirectoryError):
        await unlink(
            accessor,
            PathSpec(original=f"{date_path}/Sub__msg1",
                     directory=f"{date_path}/Sub__msg1",
                     prefix="/gmail"), index)
