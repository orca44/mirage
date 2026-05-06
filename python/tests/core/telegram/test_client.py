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

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from mirage.core.telegram._client import telegram_get, telegram_post
from mirage.resource.telegram.config import TelegramConfig


@pytest.fixture
def config():
    return TelegramConfig(token="123456:ABC-DEF")


@pytest.mark.asyncio
async def test_telegram_get_success(config):
    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.json = AsyncMock(
        return_value={
            "ok": True,
            "result": [{
                "id": 1,
                "type": "group",
                "title": "Test"
            }],
        })
    mock_resp.raise_for_status = MagicMock()
    mock_session = AsyncMock()
    mock_session.get = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=mock_resp),
        __aexit__=AsyncMock(return_value=False),
    ))

    with patch(
            "mirage.core.telegram._client.aiohttp.ClientSession") as mock_cs:
        mock_cs.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cs.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await telegram_get(config, "getUpdates")

    assert result == [{"id": 1, "type": "group", "title": "Test"}]
    mock_session.get.assert_called_once()
    call_kwargs = mock_session.get.call_args
    assert "bot123456:ABC-DEF" in call_kwargs.args[0]


@pytest.mark.asyncio
async def test_telegram_get_rate_limited(config):
    mock_resp = AsyncMock()
    mock_resp.status = 429
    mock_resp.json = AsyncMock(return_value={
        "ok": False,
        "parameters": {
            "retry_after": 1
        },
    })
    mock_session = AsyncMock()
    mock_session.get = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=mock_resp),
        __aexit__=AsyncMock(return_value=False),
    ))

    with patch(
            "mirage.core.telegram._client.aiohttp.ClientSession") as mock_cs:
        mock_cs.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cs.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(RuntimeError, match="Rate limited"):
            await telegram_get(config, "getUpdates")


@pytest.mark.asyncio
async def test_telegram_get_api_error(config):
    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.json = AsyncMock(return_value={
        "ok": False,
        "description": "Unauthorized",
    })
    mock_resp.raise_for_status = MagicMock()
    mock_session = AsyncMock()
    mock_session.get = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=mock_resp),
        __aexit__=AsyncMock(return_value=False),
    ))

    with patch(
            "mirage.core.telegram._client.aiohttp.ClientSession") as mock_cs:
        mock_cs.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cs.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(RuntimeError, match="Unauthorized"):
            await telegram_get(config, "getMe")


@pytest.mark.asyncio
async def test_telegram_post_success(config):
    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.json = AsyncMock(return_value={
        "ok": True,
        "result": {
            "message_id": 42,
            "text": "hello"
        },
    })
    mock_resp.raise_for_status = MagicMock()
    mock_session = AsyncMock()
    mock_session.post = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=mock_resp),
        __aexit__=AsyncMock(return_value=False),
    ))

    with patch(
            "mirage.core.telegram._client.aiohttp.ClientSession") as mock_cs:
        mock_cs.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cs.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await telegram_post(config,
                                     "sendMessage",
                                     body={
                                         "chat_id": 123,
                                         "text": "hello"
                                     })

    assert result["message_id"] == 42
