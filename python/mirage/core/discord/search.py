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

from mirage.core.discord._client import discord_get
from mirage.resource.discord.config import DiscordConfig

PAGE_SIZE = 25


async def search_guild(
    config: DiscordConfig,
    guild_id: str,
    query: str,
    channel_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Search messages in a guild, optionally filtered to one channel.

    Uses the Discord guild message search endpoint. Paginates
    automatically until limit or total_results is reached.

    Args:
        config (DiscordConfig): credentials.
        guild_id (str): guild snowflake ID.
        query (str): search text (content match).
        channel_id (str | None): filter to specific channel.
        limit (int): max results to return.

    Returns:
        list[dict]: matching messages (first message in each
            context array, sorted oldest-first).
    """
    params: dict[str, str | int] = {"content": query}
    if channel_id:
        params["channel_id"] = channel_id

    messages: list[dict] = []
    offset = 0
    while offset < limit:
        params["offset"] = offset
        data = await discord_get(
            config,
            f"/guilds/{guild_id}/messages/search",
            params=params,
        )
        if not isinstance(data, dict):
            break
        total = data.get("total_results", 0)
        hits = data.get("messages", [])
        if not hits:
            break
        for context in hits:
            if context:
                messages.append(context[0])
            if len(messages) >= limit:
                break
        offset += PAGE_SIZE
        if offset >= total or len(messages) >= limit:
            break

    messages.sort(key=lambda m: int(m.get("id", 0)))
    return messages[:limit]


def format_grep_results(
    messages: list[dict],
    prefix: str,
    guild_dirname: str,
    channel_names: dict[str, str] | None = None,
) -> list[str]:
    names = channel_names or {}
    lines: list[str] = []
    for msg in messages:
        ts = msg.get("timestamp", "")[:10]
        ch_id = msg.get("channel_id", "")
        ch_name = names.get(ch_id, ch_id)
        author = msg.get("author", {}).get("username", "?")
        content = msg.get("content", "").replace("\n", " ")
        lines.append(f"{prefix}/{guild_dirname}/channels/{ch_name}/"
                     f"{ts}.jsonl:[{author}] {content}")
    return lines
