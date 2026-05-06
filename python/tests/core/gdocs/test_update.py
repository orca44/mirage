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

from mirage.core.gdocs._client import TokenManager
from mirage.core.gdocs.update import batch_update
from mirage.resource.gdocs.config import GDocsConfig


@pytest.fixture
def token_manager():
    config = GDocsConfig(
        client_id="test-id",
        client_secret="test-secret",
        refresh_token="test-refresh",
    )
    mgr = TokenManager(config)
    mgr._access_token = "fake-token"
    mgr._expires_at = 9999999999
    return mgr


@pytest.mark.asyncio
async def test_batch_update(token_manager):
    payload = json.dumps({
        "requests": [{
            "insertText": {
                "location": {
                    "index": 1
                },
                "text": "Hello"
            }
        }]
    })
    api_response = {"documentId": "abc123", "replies": [{}]}
    with patch(
            "mirage.core.gdocs.update.google_post",
            new_callable=AsyncMock,
            return_value=api_response,
    ) as mock_post:
        result = await batch_update(token_manager, "abc123", payload)
        assert result["documentId"] == "abc123"
        mock_post.assert_called_once()


@pytest.mark.asyncio
async def test_batch_update_invalid_json(token_manager):
    with pytest.raises(ValueError, match="requests"):
        await batch_update(token_manager, "abc123", "not json")


@pytest.mark.asyncio
async def test_batch_update_missing_requests_key(token_manager):
    with pytest.raises(ValueError, match="requests"):
        await batch_update(token_manager, "abc123", '{"foo": "bar"}')
