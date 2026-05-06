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

from mirage.accessor.telegram import TelegramAccessor
from mirage.commands.registry import command
from mirage.commands.spec.types import CommandSpec, OperandKind, Option
from mirage.core.telegram.post import send_message
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec

SPEC = CommandSpec(options=(
    Option(long="--chat_id", value_kind=OperandKind.TEXT),
    Option(long="--text", value_kind=OperandKind.TEXT),
    Option(long="--reply_to_message_id", value_kind=OperandKind.TEXT),
), )


@command("telegram-send-message", resource="telegram", spec=SPEC, write=True)
async def telegram_send_message(
    accessor: TelegramAccessor,
    paths: list[PathSpec],
    *texts: str,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    chat_id = _extra.get("chat_id", "")
    text = _extra.get("text", "")
    reply_id = _extra.get("reply_to_message_id", "")
    if not chat_id or not isinstance(chat_id, str):
        raise ValueError("--chat_id is required")
    if not text or not isinstance(text, str):
        raise ValueError("--text is required")
    ref = int(reply_id) if reply_id and isinstance(reply_id, str) else None
    result = await send_message(accessor.config, chat_id, text, ref)
    out = json.dumps(result, ensure_ascii=False).encode()
    return out, IOResult()
