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


async def list_guilds(config: DiscordConfig) -> list[dict]:
    """List guilds the bot is in.

    Args:
        config (DiscordConfig): Discord credentials.

    Returns:
        list[dict]: guild dicts with id, name.
    """
    return await discord_get(config, "/users/@me/guilds")
