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
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from mirage.accessor.paperclip import PaperclipAccessor
from mirage.resource.paperclip.config import PaperclipConfig

FAKE_CREDENTIALS = {
    "refresh_token": "fake-refresh-token",
    "email": "test@example.com",
    "uid": "uid-123",
    "id_token": "fake-id-token",
    "id_token_expires_at": 9999999999,
    "created_at": 1700000000,
}


@pytest.fixture
def tmp_credentials(tmp_path):
    creds_file = tmp_path / "credentials.json"
    creds_file.write_text(json.dumps(FAKE_CREDENTIALS))
    return str(creds_file)


@pytest.fixture
def config(tmp_credentials):
    return PaperclipConfig(credentials_path=tmp_credentials)


@pytest.fixture
def accessor(config):
    return PaperclipAccessor(config)


def test_accessor_init(accessor, config):
    assert accessor.config is config
    assert accessor._id_token == "fake-id-token"
    assert accessor._id_token_expires_at == 9999999999
    assert accessor._credentials["refresh_token"] == "fake-refresh-token"


def test_accessor_missing_credentials():
    config = PaperclipConfig(credentials_path="/nonexistent/credentials.json")
    with pytest.raises(FileNotFoundError, match="credentials not found"):
        PaperclipAccessor(config)


@pytest.mark.asyncio
async def test_execute_command(accessor):
    expected_response = {
        "output": "search results here",
        "elapsed_ms": 150,
        "result_id": "res-abc",
    }
    mock_resp = AsyncMock()
    mock_resp.status = 200
    mock_resp.json = AsyncMock(return_value=expected_response)
    mock_resp.raise_for_status = MagicMock()

    mock_session = AsyncMock()
    mock_session.post = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=mock_resp),
        __aexit__=AsyncMock(return_value=False),
    ))

    with patch("mirage.accessor.paperclip.aiohttp.ClientSession") as mock_cs:
        mock_cs.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cs.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await accessor.execute("search BRCA1", raw="")

    assert result == expected_response
    mock_session.post.assert_called_once()
    call_kwargs = mock_session.post.call_args
    assert call_kwargs.args[0] == "https://paperclip.gxl.ai/api/cli/execute"
    assert call_kwargs.kwargs["json"] == {
        "command": "search BRCA1",
        "raw": "",
    }
    assert call_kwargs.kwargs["headers"]["Authorization"] == \
        "Bearer fake-id-token"


@pytest.mark.asyncio
async def test_execute_auth_failure(accessor):
    mock_resp = AsyncMock()
    mock_resp.status = 401
    mock_resp.json = AsyncMock(return_value={"error": "unauthorized"})

    mock_session = AsyncMock()
    mock_session.post = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=mock_resp),
        __aexit__=AsyncMock(return_value=False),
    ))

    with patch("mirage.accessor.paperclip.aiohttp.ClientSession") as mock_cs:
        mock_cs.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cs.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(PermissionError, match="auth failed"):
            await accessor.execute("search BRCA1")


@pytest.mark.asyncio
async def test_execute_rate_limited(accessor):
    mock_resp = AsyncMock()
    mock_resp.status = 429
    mock_resp.json = AsyncMock(return_value={"error": "rate limited"})

    mock_session = AsyncMock()
    mock_session.post = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=mock_resp),
        __aexit__=AsyncMock(return_value=False),
    ))

    with patch("mirage.accessor.paperclip.aiohttp.ClientSession") as mock_cs:
        mock_cs.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_cs.return_value.__aexit__ = AsyncMock(return_value=False)

        with pytest.raises(RuntimeError, match="Rate limited"):
            await accessor.execute("search BRCA1")
