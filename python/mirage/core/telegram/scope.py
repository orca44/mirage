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

from dataclasses import dataclass

from mirage.types import PathSpec

CATEGORIES = {"groups", "channels", "private"}


@dataclass
class TelegramScope:
    level: str
    category: str | None = None
    chat_id: str | None = None
    date_str: str | None = None


def detect_scope(path: PathSpec) -> TelegramScope:
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    if isinstance(path, PathSpec):
        prefix = path.prefix or ""
        path = path.original
        if prefix and path.startswith(prefix):
            path = path[len(prefix):]

    key = path.strip("/")

    if not key:
        return TelegramScope(level="root")

    parts = key.split("/")

    if len(parts) == 1 and parts[0] in CATEGORIES:
        return TelegramScope(level="category", category=parts[0])

    if len(parts) == 2 and parts[0] in CATEGORIES:
        return TelegramScope(level="chat", category=parts[0])

    if (len(parts) == 3 and parts[0] in CATEGORIES
            and parts[2].endswith(".jsonl")):
        date_str = parts[2].removesuffix(".jsonl")
        return TelegramScope(
            level="file",
            category=parts[0],
            date_str=date_str,
        )

    return TelegramScope(level="file")
