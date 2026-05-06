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

from mirage.core.telegram._client import telegram_post
from mirage.resource.telegram.config import TelegramConfig


async def send_message(
    config: TelegramConfig,
    chat_id: int | str,
    text: str,
    reply_to_message_id: int | None = None,
) -> dict:
    body: dict = {"chat_id": chat_id, "text": text}
    if reply_to_message_id:
        body["reply_parameters"] = {"message_id": reply_to_message_id}
    return await telegram_post(config, "sendMessage", body)
