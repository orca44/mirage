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

from mirage.accessor.discord import DiscordAccessor
from mirage.commands.builtin.discord.discord_add_reaction import \
    discord_add_reaction
from mirage.commands.builtin.discord.discord_send_message import \
    discord_send_message
from mirage.resource.discord.config import DiscordConfig


@pytest.fixture
def accessor():
    return DiscordAccessor(config=DiscordConfig(token="test-bot-token"), )


@pytest.mark.asyncio
async def test_send_message(accessor):
    with patch(
            "mirage.commands.builtin.discord.discord_send_message"
            ".send_message",
            new_callable=AsyncMock,
            return_value={
                "id": "msg1",
                "content": "hello"
            },
    ) as mock_send:
        stream, io_result = await discord_send_message(accessor, [],
                                                       channel_id="C001",
                                                       text="hello")

    mock_send.assert_called_once_with(accessor.config, "C001", "hello", None)
    out = json.loads(stream)
    assert out["id"] == "msg1"


@pytest.mark.asyncio
async def test_add_reaction(accessor):
    with patch(
            "mirage.commands.builtin.discord.discord_add_reaction"
            ".add_reaction",
            new_callable=AsyncMock,
            return_value=None,
    ) as mock_react:
        stream, io_result = await discord_add_reaction(accessor, [],
                                                       channel_id="C001",
                                                       message_id="msg1",
                                                       reaction="thumbsup")

    mock_react.assert_called_once_with(accessor.config, "C001", "msg1",
                                       "thumbsup")
    out = json.loads(stream)
    assert out["ok"] is True
