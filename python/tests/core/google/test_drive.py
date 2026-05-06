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

from mirage.core.google._client import TokenManager
from mirage.core.google.config import GoogleConfig
from mirage.core.google.drive import (download_file, download_file_stream,
                                      get_file_metadata, list_all_files,
                                      list_files)


@pytest.fixture
def config():
    return GoogleConfig(
        client_id="test-id",
        client_secret="test-secret",
        refresh_token="test-refresh",
    )


@pytest.fixture
def token_manager(config):
    mgr = TokenManager(config)
    mgr._access_token = "fake-token"
    mgr._expires_at = 9999999999
    return mgr


@pytest.mark.asyncio
async def test_list_files(token_manager):
    mock_response = {
        "files": [
            {
                "id": "f1",
                "name": "doc.txt",
                "mimeType": "text/plain"
            },
            {
                "id": "f2",
                "name": "sheet",
                "mimeType": "application/vnd.google-apps.spreadsheet"
            },
        ],
    }
    with patch(
            "mirage.core.google.drive.google_get",
            new_callable=AsyncMock,
            return_value=mock_response,
    ) as mock_get:
        result = await list_files(token_manager, folder_id="folder123")
        assert len(result) == 2
        assert result[0]["id"] == "f1"
        call_kwargs = mock_get.call_args
        params = call_kwargs.kwargs["params"]
        assert "'folder123' in parents" in params["q"]
        assert "trashed=false" in params["q"]


@pytest.mark.asyncio
async def test_list_all_files(token_manager):
    page1 = {
        "files": [{
            "id": "f1",
            "name": "a.txt",
            "mimeType": "text/plain"
        }],
        "nextPageToken": "token2",
    }
    page2 = {
        "files": [{
            "id": "f2",
            "name": "b.txt",
            "mimeType": "text/plain"
        }],
    }
    with patch(
            "mirage.core.google.drive.google_get",
            new_callable=AsyncMock,
            side_effect=[page1, page2],
    ):
        result = await list_all_files(token_manager)
        assert len(result) == 2
        assert result[0]["id"] == "f1"
        assert result[1]["id"] == "f2"


@pytest.mark.asyncio
async def test_download_file(token_manager):
    content = b"file content bytes"
    with patch(
            "mirage.core.google.drive.google_get_bytes",
            new_callable=AsyncMock,
            return_value=content,
    ):
        result = await download_file(token_manager, "file123")
        assert result == content


@pytest.mark.asyncio
async def test_download_file_stream(token_manager):
    chunks = [b"chunk1", b"chunk2", b"chunk3"]

    async def mock_stream(*args, **kwargs):
        for chunk in chunks:
            yield chunk

    with patch(
            "mirage.core.google.drive.google_get_stream",
            side_effect=mock_stream,
    ):
        result = b""
        async for chunk in download_file_stream(token_manager, "file123"):
            result += chunk
        assert result == b"chunk1chunk2chunk3"


@pytest.mark.asyncio
async def test_download_file_stream_empty(token_manager):

    async def mock_stream(*args, **kwargs):
        return
        yield

    with patch(
            "mirage.core.google.drive.google_get_stream",
            side_effect=mock_stream,
    ):
        result = b""
        async for chunk in download_file_stream(token_manager, "file123"):
            result += chunk
        assert result == b""


@pytest.mark.asyncio
async def test_get_file_metadata(token_manager):
    metadata = {
        "id": "file123",
        "name": "report.pdf",
        "mimeType": "application/pdf",
        "modifiedTime": "2026-04-01T00:00:00.000Z",
    }
    with patch(
            "mirage.core.google.drive.google_get",
            new_callable=AsyncMock,
            return_value=metadata,
    ) as mock_get:
        result = await get_file_metadata(token_manager, "file123")
        assert result["id"] == "file123"
        assert result["name"] == "report.pdf"
        call_kwargs = mock_get.call_args
        assert "fields" in call_kwargs.kwargs["params"]


@pytest.mark.asyncio
async def test_list_all_files_with_modified_range():
    captured = {}

    async def fake_get(token_manager, url, params=None):
        captured["params"] = params
        return {"files": []}

    with patch("mirage.core.google.drive.google_get", new=fake_get):
        await list_all_files(
            token_manager=None,
            mime_type="application/vnd.google-apps.document",
            modified_after="2026-05-01T00:00:00Z",
            modified_before="2026-06-01T00:00:00Z",
        )

    q = captured["params"]["q"]
    assert "modifiedTime >= '2026-05-01T00:00:00Z'" in q
    assert "modifiedTime < '2026-06-01T00:00:00Z'" in q
    assert "mimeType='application/vnd.google-apps.document'" in q
    assert "trashed=false" in q


@pytest.mark.asyncio
async def test_list_all_files_without_range_omits_clauses():
    captured = {}

    async def fake_get(token_manager, url, params=None):
        captured["params"] = params
        return {"files": []}

    with patch("mirage.core.google.drive.google_get", new=fake_get):
        await list_all_files(token_manager=None)

    q = captured["params"].get("q")
    if q is None:
        return
    assert "modifiedTime" not in q


@pytest.mark.asyncio
async def test_list_files_with_modified_range():
    captured = {}

    async def fake_get(token_manager, url, params=None):
        captured["params"] = params
        return {"files": []}

    with patch("mirage.core.google.drive.google_get", new=fake_get):
        await list_files(
            token_manager=None,
            folder_id="root",
            modified_after="2026-05-01T00:00:00Z",
        )

    q = captured["params"]["q"]
    assert "'root' in parents" in q
    assert "modifiedTime >= '2026-05-01T00:00:00Z'" in q
    assert "modifiedTime <" not in q


@pytest.mark.asyncio
async def test_list_files_with_full_modified_range():
    captured = {}

    async def fake_get(token_manager, url, params=None):
        captured["params"] = params
        return {"files": []}

    with patch("mirage.core.google.drive.google_get", new=fake_get):
        await list_files(
            token_manager=None,
            folder_id="root",
            modified_after="2026-05-01T00:00:00Z",
            modified_before="2026-06-01T00:00:00Z",
        )

    q = captured["params"]["q"]
    assert "'root' in parents" in q
    assert "modifiedTime >= '2026-05-01T00:00:00Z'" in q
    assert "modifiedTime < '2026-06-01T00:00:00Z'" in q
