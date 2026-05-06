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
from datetime import datetime, timezone

from mirage.core.slack._client import slack_get
from mirage.resource.slack.config import SlackConfig


async def fetch_messages_for_day(
    config: SlackConfig,
    channel_id: str,
    date_str: str,
) -> list[dict]:
    """Fetch all messages for a date as parsed dicts.

    Args:
        config (SlackConfig): Slack credentials.
        channel_id (str): channel ID.
        date_str (str): date in YYYY-MM-DD format.

    Returns:
        list[dict]: messages sorted by ts ascending.
    """
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    dt = dt.replace(tzinfo=timezone.utc)
    oldest = str(dt.timestamp())
    latest = str(dt.replace(hour=23, minute=59, second=59).timestamp())

    messages: list[dict] = []
    cursor: str | None = None
    while True:
        params: dict = {
            "channel": channel_id,
            "oldest": oldest,
            "latest": latest,
            "limit": 200,
            "inclusive": "true",
        }
        if cursor:
            params["cursor"] = cursor
        data = await slack_get(config, "conversations.history", params=params)
        messages.extend(data.get("messages", []))
        if not data.get("has_more"):
            break
        cursor = (data.get("response_metadata", {}).get("next_cursor", ""))
        if not cursor:
            break
    messages.sort(key=lambda m: float(m.get("ts", "0")))
    return messages


async def get_history_jsonl(
    config: SlackConfig,
    channel_id: str,
    date_str: str,
) -> bytes:
    """Fetch channel messages for a specific date as JSONL.

    Args:
        config (SlackConfig): Slack credentials.
        channel_id (str): channel ID.
        date_str (str): date in YYYY-MM-DD format.

    Returns:
        bytes: JSONL-encoded messages.
    """
    messages = await fetch_messages_for_day(config, channel_id, date_str)
    lines = [json.dumps(m, ensure_ascii=False) for m in messages]
    return ("\n".join(lines) + "\n").encode() if lines else b""


async def get_thread_jsonl(
    config: SlackConfig,
    channel_id: str,
    thread_ts: str,
) -> list[dict]:
    """Fetch thread replies.

    Args:
        config (SlackConfig): Slack credentials.
        channel_id (str): channel ID.
        thread_ts (str): parent message ts.

    Returns:
        list[dict]: reply messages.
    """
    replies: list[dict] = []
    cursor: str | None = None
    while True:
        params: dict = {
            "channel": channel_id,
            "ts": thread_ts,
            "limit": 200,
        }
        if cursor:
            params["cursor"] = cursor
        data = await slack_get(config, "conversations.replies", params=params)
        replies.extend(data.get("messages", []))
        if not data.get("has_more"):
            break
        cursor = (data.get("response_metadata", {}).get("next_cursor", ""))
        if not cursor:
            break
    return replies
