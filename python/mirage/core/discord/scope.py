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

from mirage.cache.index import IndexCacheStore
from mirage.types import PathSpec


@dataclass
class DiscordScope:
    """Resolved scope for a discord path.

    Attributes:
        level (str): "file", "channel", "guild", or "root".
        guild_id (str | None): guild snowflake ID.
        channel_id (str | None): channel snowflake ID.
        date_str (str | None): YYYY-MM-DD for file-level paths.
        resource_path (str): resource-relative path (prefix stripped).
    """

    level: str
    guild_id: str | None = None
    channel_id: str | None = None
    date_str: str | None = None
    resource_path: str = "/"


async def detect_scope(
    path: PathSpec,
    index: IndexCacheStore = None,
) -> DiscordScope:
    """Determine scope from a resolved path or raw PathSpec.

    Args:
        path (str | PathSpec): virtual path or raw PathSpec.
        index (IndexCacheStore | None): index for looking up IDs.

    Examples::

        guild/channels/general/2024-04-10.jsonl → file
        guild/channels/general/ (or *.jsonl glob) → channel
        guild/ or guild/channels/                → guild
        / (empty)                                → root
    """
    prefix = path.prefix if isinstance(path, PathSpec) else ""

    # PathSpec: glob pattern in a channel dir → channel scope
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    if isinstance(path, PathSpec):
        if path.pattern and path.pattern.endswith(".jsonl"):
            dir_key = path.directory.strip("/")
            if prefix:
                dir_key = dir_key.removeprefix(prefix.strip("/") + "/")
            parts = dir_key.split("/")
            if len(parts) == 3 and parts[1] == "channels":
                guild_id, channel_id = await _resolve_ids(
                    parts[0], "/".join(parts[:3]), index, prefix)
                return DiscordScope(
                    level="channel",
                    guild_id=guild_id,
                    channel_id=channel_id,
                    resource_path=dir_key,
                )
        path = path.original

    # Strip prefix for resource-relative key
    if isinstance(path, str) and prefix:
        stripped = path.strip("/")
        pfx = prefix.strip("/")
        if stripped.startswith(pfx + "/"):
            stripped = stripped[len(pfx) + 1:]
        elif stripped == pfx:
            stripped = ""
        key = stripped
    else:
        key = path.strip("/") if isinstance(path, str) else ""

    if not key:
        return DiscordScope(level="root", resource_path="/")

    parts = key.split("/")

    # File: guild/channels/ch/date.jsonl
    if len(parts) == 4 and parts[1] == "channels" and parts[3].endswith(
            ".jsonl"):
        date_str = parts[3].removesuffix(".jsonl")
        guild_id, channel_id = await _resolve_ids(parts[0],
                                                  "/".join(parts[:3]), index,
                                                  prefix)
        return DiscordScope(
            level="file",
            guild_id=guild_id,
            channel_id=channel_id,
            date_str=date_str,
            resource_path=key,
        )

    # Channel: guild/channels/ch
    if len(parts) == 3 and parts[1] == "channels":
        guild_id, channel_id = await _resolve_ids(parts[0], key, index, prefix)
        return DiscordScope(
            level="channel",
            guild_id=guild_id,
            channel_id=channel_id,
            resource_path=key,
        )

    # Guild: guild or guild/channels or guild/members
    if len(parts) <= 2:
        guild_id = await _resolve_guild_id(parts[0], index, prefix)
        return DiscordScope(
            level="guild",
            guild_id=guild_id,
            resource_path=key,
        )

    return DiscordScope(level="file", resource_path=key)


async def coalesce_scopes(
    paths: list[PathSpec],
    index: IndexCacheStore = None,
) -> DiscordScope | None:
    if not paths:
        return None
    scopes = [await detect_scope(p, index) for p in paths]
    first = scopes[0]
    if first.guild_id is None or first.channel_id is None:
        return None
    for s in scopes[1:]:
        if (s.guild_id != first.guild_id or s.channel_id != first.channel_id):
            return None
    return DiscordScope(
        level="channel",
        guild_id=first.guild_id,
        channel_id=first.channel_id,
        resource_path=first.resource_path.rsplit("/", 1)[0]
        if first.level == "file" else first.resource_path,
    )


async def _resolve_guild_id(
    guild_name: str,
    index: IndexCacheStore | None,
    prefix: str,
) -> str | None:
    if index is None:
        return None
    virtual_key = prefix + "/" + guild_name if prefix else "/" + guild_name
    lookup = await index.get(virtual_key)
    if lookup.entry is not None:
        return lookup.entry.id
    return None


async def _resolve_ids(
    guild_name: str,
    channel_path: PathSpec,
    index: IndexCacheStore | None,
    prefix: str,
) -> tuple[str | None, str | None]:
    guild_id = await _resolve_guild_id(guild_name, index, prefix)
    channel_id = None
    if index is not None:
        virtual_key = (prefix + "/" + channel_path if prefix else "/" +
                       channel_path)
        lookup = await index.get(virtual_key)
        if lookup.entry is not None:
            channel_id = lookup.entry.id
    return guild_id, channel_id
