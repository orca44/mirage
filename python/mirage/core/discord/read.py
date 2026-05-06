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

from mirage.accessor.discord import DiscordAccessor
from mirage.cache.index import IndexCacheStore
from mirage.core.discord.history import get_history_jsonl
from mirage.core.discord.members import list_members
from mirage.types import PathSpec


async def read(
    accessor: DiscordAccessor,
    path: PathSpec,
    index: IndexCacheStore = None,
) -> bytes:
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    if isinstance(path, PathSpec):
        prefix = path.prefix
        path = path.original

    if prefix and path.startswith(prefix):
        path = path[len(prefix):] or "/"
    key = path.strip("/")
    parts = key.split("/")

    if (len(parts) == 4 and parts[1] == "channels"
            and parts[3].endswith(".jsonl")):
        ch_key = f"{parts[0]}/{parts[1]}/{parts[2]}"
        if index is None:
            raise FileNotFoundError(key)
        ch_virtual = prefix + "/" + ch_key
        ch_lookup = await index.get(ch_virtual)
        if ch_lookup.entry is None:
            raise FileNotFoundError(key)
        date_str = parts[3].removesuffix(".jsonl")
        return await get_history_jsonl(accessor.config, ch_lookup.entry.id,
                                       date_str)

    if (len(parts) == 3 and parts[1] == "members"):
        if index is None:
            raise FileNotFoundError(key)
        virtual_key = prefix + "/" + key
        entry_lookup = await index.get(virtual_key)
        if entry_lookup.entry is None:
            raise FileNotFoundError(key)
        guild_virtual = prefix + "/" + parts[0]
        guild_lookup = await index.get(guild_virtual)
        if guild_lookup.entry is None:
            raise FileNotFoundError(key)
        members = await list_members(accessor.config,
                                     guild_lookup.entry.id,
                                     limit=200)
        for m in members:
            user = m.get("user", {})
            if user.get("id") == entry_lookup.entry.id:
                return json.dumps(m, ensure_ascii=False).encode()
        raise FileNotFoundError(key)

    raise FileNotFoundError(key)
