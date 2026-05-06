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

from mirage.core.slack._client import slack_get
from mirage.resource.slack.config import SlackConfig


async def list_channels(
    config: SlackConfig,
    types: str = "public_channel,private_channel",
    limit: int = 200,
) -> list[dict]:
    """List channels via conversations.list.

    Args:
        config (SlackConfig): Slack credentials.
        types (str): channel types to list.
        limit (int): max per page.

    Returns:
        list[dict]: channel metadata dicts.
    """
    channels: list[dict] = []
    cursor: str | None = None
    while True:
        params: dict = {
            "types": types,
            "limit": limit,
            "exclude_archived": "true",
        }
        if cursor:
            params["cursor"] = cursor
        data = await slack_get(config, "conversations.list", params=params)
        channels.extend(data.get("channels", []))
        cursor = (data.get("response_metadata", {}).get("next_cursor", ""))
        if not cursor:
            break
    return channels


async def list_dms(
    config: SlackConfig,
    limit: int = 200,
) -> list[dict]:
    """List direct messages via conversations.list.

    Args:
        config (SlackConfig): Slack credentials.
        limit (int): max per page.

    Returns:
        list[dict]: DM channel dicts.
    """
    return await list_channels(config, types="im,mpim", limit=limit)
