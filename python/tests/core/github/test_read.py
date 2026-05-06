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

import base64
from unittest.mock import AsyncMock, patch

import pytest

from mirage.core.github.config import GitHubConfig
from mirage.core.github.read import read_bytes


@pytest.fixture
def config():
    return GitHubConfig(token="ghp_test")


@pytest.mark.asyncio
@patch("mirage.core.github.read.github_get", new_callable=AsyncMock)
async def test_read_bytes_utf8(mock_get, config):
    content = b"hello world"
    mock_get.return_value = {"content": base64.b64encode(content).decode()}
    result = await read_bytes(config, "acme", "proj", "sha123")
    assert result == content
    assert result.decode("utf-8") == "hello world"


@pytest.mark.asyncio
@patch("mirage.core.github.read.github_get", new_callable=AsyncMock)
async def test_read_bytes_binary(mock_get, config):
    content = bytes(range(256))
    mock_get.return_value = {"content": base64.b64encode(content).decode()}
    result = await read_bytes(config, "acme", "proj", "sha456")
    assert result == content
