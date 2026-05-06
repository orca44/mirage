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


async def list_members(
    config: DiscordConfig,
    guild_id: str,
    limit: int = 200,
) -> list[dict]:
    """List guild members (first page).

    Args:
        config (DiscordConfig): Discord credentials.
        guild_id (str): guild ID.
        limit (int): max members.

    Returns:
        list[dict]: member dicts.
    """
    return await discord_get(
        config,
        f"/guilds/{guild_id}/members",
        params={"limit": limit},
    )


async def search_members(
    config: DiscordConfig,
    guild_id: str,
    query: str,
    limit: int = 100,
) -> list[dict]:
    """Search guild members by name.

    Args:
        config (DiscordConfig): Discord credentials.
        guild_id (str): guild ID.
        query (str): search query.
        limit (int): max results.

    Returns:
        list[dict]: matching members.
    """
    return await discord_get(
        config,
        f"/guilds/{guild_id}/members/search",
        params={
            "query": query,
            "limit": limit
        },
    )
