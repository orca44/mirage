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

from mirage.accessor.linear import LinearAccessor
from mirage.commands.builtin.linear.linear_issue_comment_add import \
    linear_issue_comment_add
from mirage.commands.builtin.linear.linear_issue_create import \
    linear_issue_create
from mirage.commands.builtin.linear.linear_issue_update import \
    linear_issue_update
from mirage.resource.linear.config import LinearConfig


@pytest.fixture
def accessor():
    return LinearAccessor(LinearConfig(api_key="lin_api_test"))


@pytest.mark.asyncio
async def test_issue_create_uses_stdin(accessor):
    issue = {
        "id": "ISSUE1",
        "identifier": "ENG-123",
        "title": "Bug",
        "description": "Body",
        "team": {
            "id": "TEAM1",
            "key": "ENG",
            "name": "Engineering",
        },
        "state": {},
        "project": {},
        "cycle": {},
        "assignee": {},
        "creator": {},
        "labels": {
            "nodes": []
        },
        "createdAt": "",
        "updatedAt": "",
        "priority": None,
        "url": "",
    }
    with patch(
            "mirage.commands.builtin.linear.linear_issue_create.issue_create",
            new_callable=AsyncMock,
            return_value=issue,
    ) as mock_create:
        stream, _ = await linear_issue_create(
            accessor,
            [],
            stdin=b"Body",
            team_id="TEAM1",
            title="Bug",
        )
    mock_create.assert_called_once()
    assert mock_create.call_args.kwargs["description"] == "Body"
    out = json.loads(b"".join([chunk async for chunk in stream]))
    assert out["issue_id"] == "ISSUE1"


@pytest.mark.asyncio
async def test_issue_update_prefers_inline_text(accessor):
    issue = {
        "id": "ISSUE1",
        "identifier": "ENG-123",
        "title": "Bug",
        "description": "Inline",
        "team": {
            "id": "TEAM1",
            "key": "ENG",
            "name": "Engineering",
        },
        "state": {},
        "project": {},
        "cycle": {},
        "assignee": {},
        "creator": {},
        "labels": {
            "nodes": []
        },
        "createdAt": "",
        "updatedAt": "",
        "priority": None,
        "url": "",
    }
    mod = "mirage.commands.builtin.linear"
    with patch(
            f"{mod}.linear_issue_update.resolve_issue_id",
            new_callable=AsyncMock,
            return_value="ISSUE1",
    ), patch(
            f"{mod}.linear_issue_update.issue_update",
            new_callable=AsyncMock,
            return_value=issue,
    ) as mock_update, patch(
            f"{mod}._input.read_bytes",
            new_callable=AsyncMock,
            return_value=b"From file",
    ):
        await linear_issue_update(
            accessor,
            [],
            stdin=b"From stdin",
            issue_key="ENG-123",
            description="Inline",
        )
    assert mock_update.call_args.kwargs["description"] == "Inline"


@pytest.mark.asyncio
async def test_comment_add_uses_body_file_before_stdin(accessor):
    comment = {
        "id": "COMMENT1",
        "body": "From file",
        "createdAt": "2026-04-05T00:00:00Z",
        "updatedAt": "2026-04-05T00:00:00Z",
        "url": "https://linear.app/comment",
        "user": {
            "id": "USER1",
            "name": "Alice",
            "displayName": "Alice",
            "email": "alice@example.com",
        },
    }
    mod = "mirage.commands.builtin.linear"
    with patch(
            f"{mod}.linear_issue_comment_add.resolve_issue_id",
            new_callable=AsyncMock,
            return_value="ISSUE1",
    ), patch(
            f"{mod}._input.read_bytes",
            new_callable=AsyncMock,
            return_value=b"From file",
    ), patch(
            f"{mod}.linear_issue_comment_add.comment_create",
            new_callable=AsyncMock,
            return_value=comment,
    ) as mock_comment_create:
        await linear_issue_comment_add(
            accessor,
            [],
            stdin=b"From stdin",
            issue_key="ENG-123",
            body_file="/tmp/body.md",
        )
    assert mock_comment_create.call_args.kwargs["body"] == "From file"
