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

from mirage.core.telegram._client import telegram_get
from mirage.resource.telegram.config import TelegramConfig


async def get_updates_for_chat(
    config: TelegramConfig,
    chat_id: int | str,
    date_str: str,
) -> bytes:
    params: dict = {"limit": 100, "allowed_updates": '["message"]'}
    updates = await telegram_get(config, "getUpdates", params=params)
    target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    messages: list[dict] = []
    for update in updates:
        msg = update.get("message") or update.get("channel_post")
        if not msg:
            continue
        chat = msg.get("chat", {})
        if str(chat.get("id")) != str(chat_id):
            continue
        msg_date_val = msg.get("date", 0)
        msg_date = datetime.fromtimestamp(msg_date_val, tz=timezone.utc).date()
        if msg_date != target_date:
            continue
        messages.append(msg)
    messages.sort(key=lambda m: m.get("date", 0))
    lines = [json.dumps(m, ensure_ascii=False) for m in messages]
    return ("\n".join(lines) + "\n").encode() if lines else b""
