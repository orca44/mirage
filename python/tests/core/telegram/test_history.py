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

from mirage.core.telegram.history import get_updates_for_chat
from mirage.resource.telegram.config import TelegramConfig


@pytest.fixture
def config():
    return TelegramConfig(token="test-token")


@pytest.mark.asyncio
async def test_get_updates_for_chat_filters_by_chat_and_date(config):
    updates = [
        {
            "update_id": 1,
            "message": {
                "message_id": 10,
                "chat": {
                    "id": -100
                },
                "date": 1744329600,
                "text": "hello",
            },
        },
        {
            "update_id": 2,
            "message": {
                "message_id": 11,
                "chat": {
                    "id": -200
                },
                "date": 1744329600,
                "text": "other chat",
            },
        },
        {
            "update_id": 3,
            "message": {
                "message_id": 12,
                "chat": {
                    "id": -100
                },
                "date": 1744243200,
                "text": "yesterday",
            },
        },
    ]
    with patch(
            "mirage.core.telegram.history.telegram_get",
            new_callable=AsyncMock,
            return_value=updates,
    ):
        result = await get_updates_for_chat(config, -100, "2025-04-11")

    lines = result.decode().strip().split("\n")
    assert len(lines) == 1
    assert "hello" in lines[0]


@pytest.mark.asyncio
async def test_get_updates_for_chat_empty(config):
    with patch(
            "mirage.core.telegram.history.telegram_get",
            new_callable=AsyncMock,
            return_value=[],
    ):
        result = await get_updates_for_chat(config, -100, "2025-04-11")

    assert result == b""
