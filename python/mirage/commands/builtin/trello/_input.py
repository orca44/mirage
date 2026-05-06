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

from collections.abc import AsyncIterator

from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.core.trello.read import read_bytes
from mirage.resource.trello.config import TrelloConfig


async def resolve_text_input(
    config: TrelloConfig,
    *,
    inline_text: str | None,
    file_path: str | None,
    stdin: AsyncIterator[bytes] | bytes | None,
    error_message: str,
) -> str:
    if inline_text:
        return inline_text
    if file_path:
        return (await read_bytes(config, file_path)).decode(errors="replace")
    raw = await _read_stdin_async(stdin)
    if raw is not None:
        return raw.decode(errors="replace")
    raise ValueError(error_message)
