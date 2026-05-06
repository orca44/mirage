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

from mirage.core.discord._client import discord_get
from mirage.resource.discord.config import DiscordConfig

DISCORD_EPOCH = 1420070400000


def _date_to_snowflake(date_str: str, end: bool = False) -> str:
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    dt = dt.replace(tzinfo=timezone.utc)
    if end:
        dt = dt.replace(hour=23, minute=59, second=59)
    ms = int(dt.timestamp() * 1000) - DISCORD_EPOCH
    return str(ms << 22)


async def get_history_jsonl(
    config: DiscordConfig,
    channel_id: str,
    date_str: str,
) -> bytes:
    """Fetch channel messages for a date as JSONL.

    Args:
        config (DiscordConfig): Discord credentials.
        channel_id (str): channel ID.
        date_str (str): date in YYYY-MM-DD format.

    Returns:
        bytes: JSONL-encoded messages.
    """
    after = _date_to_snowflake(date_str)
    before = _date_to_snowflake(date_str, end=True)

    messages: list[dict] = []
    last_id = after
    while True:
        params = {
            "after": last_id,
            "limit": 100,
        }
        batch = await discord_get(
            config,
            f"/channels/{channel_id}/messages",
            params=params,
        )
        if not batch:
            break
        for msg in batch:
            msg_id = int(msg["id"])
            if msg_id > int(before):
                continue
            messages.append(msg)
        if len(batch) < 100:
            break
        last_id = batch[-1]["id"]

    messages.sort(key=lambda m: int(m["id"]))
    lines = [json.dumps(m, ensure_ascii=False) for m in messages]
    return ("\n".join(lines) + "\n").encode() if lines else b""
