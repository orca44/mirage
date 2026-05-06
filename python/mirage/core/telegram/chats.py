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

from mirage.core.telegram._client import telegram_get
from mirage.resource.telegram.config import TelegramConfig

CHAT_TYPE_GROUP = ("group", "supergroup")
CHAT_TYPE_CHANNEL = ("channel", )
CHAT_TYPE_PRIVATE = ("private", )


async def get_updates(
    config: TelegramConfig,
    offset: int | None = None,
    limit: int = 100,
) -> list[dict]:
    params: dict = {"limit": limit, "allowed_updates": '["message"]'}
    if offset is not None:
        params["offset"] = offset
    return await telegram_get(config, "getUpdates", params=params)


async def get_chat(config: TelegramConfig, chat_id: int | str) -> dict:
    return await telegram_get(config, "getChat", params={"chat_id": chat_id})


async def discover_chats(config: TelegramConfig) -> list[dict]:
    updates = await get_updates(config)
    seen: dict[int, dict] = {}
    for update in updates:
        msg = update.get("message") or update.get("channel_post", {})
        chat = msg.get("chat", {})
        chat_id = chat.get("id")
        if chat_id and chat_id not in seen:
            seen[chat_id] = chat
    return list(seen.values())


def chat_category(chat: dict) -> str:
    t = chat.get("type", "")
    if t in CHAT_TYPE_GROUP:
        return "groups"
    if t in CHAT_TYPE_CHANNEL:
        return "channels"
    return "private"


def chat_display_name(chat: dict) -> str:
    return (chat.get("title") or chat.get("username")
            or chat.get("first_name", "unknown"))
