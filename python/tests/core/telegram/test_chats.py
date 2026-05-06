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

from mirage.core.telegram.chats import (chat_category, chat_display_name,
                                        discover_chats)
from mirage.resource.telegram.config import TelegramConfig


@pytest.fixture
def config():
    return TelegramConfig(token="test-token")


def test_chat_category_group():
    assert chat_category({"type": "group"}) == "groups"
    assert chat_category({"type": "supergroup"}) == "groups"


def test_chat_category_channel():
    assert chat_category({"type": "channel"}) == "channels"


def test_chat_category_private():
    assert chat_category({"type": "private"}) == "private"


def test_chat_display_name_title():
    assert chat_display_name({"title": "My Group"}) == "My Group"


def test_chat_display_name_username():
    assert chat_display_name({"username": "alice"}) == "alice"


def test_chat_display_name_first_name():
    assert chat_display_name({"first_name": "Alice"}) == "Alice"


def test_chat_display_name_fallback():
    assert chat_display_name({}) == "unknown"


@pytest.mark.asyncio
async def test_discover_chats(config):
    updates = [
        {
            "update_id": 1,
            "message": {
                "chat": {
                    "id": -100,
                    "type": "group",
                    "title": "Group A"
                },
                "text": "hi",
            },
        },
        {
            "update_id": 2,
            "message": {
                "chat": {
                    "id": -100,
                    "type": "group",
                    "title": "Group A"
                },
                "text": "bye",
            },
        },
        {
            "update_id": 3,
            "message": {
                "chat": {
                    "id": 42,
                    "type": "private",
                    "username": "alice"
                },
                "text": "hello",
            },
        },
    ]
    with patch(
            "mirage.core.telegram.chats.get_updates",
            new_callable=AsyncMock,
            return_value=updates,
    ):
        chats = await discover_chats(config)

    assert len(chats) == 2
    ids = {c["id"] for c in chats}
    assert ids == {-100, 42}
