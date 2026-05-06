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

from mirage.accessor.discord import DiscordAccessor
from mirage.cache.index import IndexCacheStore, IndexEntry
from mirage.core.discord.channels import list_channels
from mirage.core.discord.guilds import list_guilds
from mirage.core.discord.members import list_members
from mirage.types import PathSpec


def _safe_name(name: str) -> str:
    if not name:
        return "unknown"
    return name.replace("/", "\u2215")


def _guild_dirname(g: dict) -> str:
    return _safe_name(g.get("name", g.get("id", "unknown")))


def _channel_dirname(c: dict) -> str:
    return _safe_name(c.get("name", c.get("id", "unknown")))


def _member_filename(m: dict) -> str:
    user = m.get("user", {})
    return _safe_name(user.get("username", user.get("id",
                                                    "unknown"))) + ".json"


def _snowflake_to_date(snowflake: str) -> str:
    from datetime import datetime, timezone
    ms = (int(snowflake) >> 22) + 1420070400000
    return datetime.fromtimestamp(ms / 1000,
                                  tz=timezone.utc).strftime("%Y-%m-%d")


def _date_range(end_date: str, days: int = 30) -> list[str]:
    from datetime import datetime, timedelta
    end = datetime.strptime(end_date, "%Y-%m-%d").date()
    return [(end - timedelta(days=i)).isoformat()
            for i in range(days - 1, -1, -1)]


async def readdir(
    accessor: DiscordAccessor,
    path: PathSpec,
    index: IndexCacheStore = None,
) -> list[str]:
    """List directory contents.

    Args:
        accessor (DiscordAccessor): discord accessor.
        path (PathSpec | str): resource-relative path.
        index (IndexCacheStore | None): index cache.
        prefix (str): mount prefix for virtual index keys.
    """
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    if isinstance(path, PathSpec):
        prefix = path.prefix
        path = path.directory if path.pattern else path.original
    if prefix and path.startswith(prefix):
        path = path[len(prefix):] or "/"
    key = path.strip("/")
    # Virtual path used as index cache key
    virtual_key = prefix + "/" + key if key else prefix or "/"

    if not key:
        if index is not None:
            listing = await index.list_dir(virtual_key)
            if listing.entries is not None:
                return listing.entries
        guilds = await list_guilds(accessor.config)
        entries = []
        names = []
        for g in guilds:
            dirname = _guild_dirname(g)
            entry = IndexEntry(
                id=g["id"],
                name=g.get("name", ""),
                resource_type="discord/guild",
                vfs_name=dirname,
            )
            entries.append((dirname, entry))
            names.append(f"{prefix}/{dirname}")
        if index is not None:
            await index.set_dir(virtual_key, entries)
        return names

    parts = key.split("/")

    if len(parts) == 1:
        if index is not None:
            lookup = await index.get(virtual_key)
            if lookup.entry is None:
                raise FileNotFoundError(path)
        return [f"{prefix}/{key}/channels", f"{prefix}/{key}/members"]

    if len(parts) == 2 and parts[1] == "channels":
        if index is not None:
            listing = await index.list_dir(virtual_key)
            if listing.entries is not None:
                return listing.entries
            guild_virtual_key = prefix + "/" + parts[0]
            guild_lookup = await index.get(guild_virtual_key)
            if guild_lookup.entry is None:
                # Auto-bootstrap: populate guild index so glob
                # can resolve without prior ls at root level.
                root = PathSpec(
                    original=prefix or "/",
                    directory=prefix or "/",
                    prefix=prefix,
                )
                await readdir(accessor, root, index)
                guild_lookup = await index.get(guild_virtual_key)
            if guild_lookup.entry is None:
                raise FileNotFoundError(path)
            guild_id = guild_lookup.entry.id
        else:
            raise FileNotFoundError(path)
        channels = await list_channels(accessor.config, guild_id)
        entries = []
        names = []
        for c in channels:
            dirname = _channel_dirname(c)
            entry = IndexEntry(
                id=c["id"],
                name=c.get("name", ""),
                resource_type="discord/channel",
                vfs_name=dirname,
                remote_time=c.get("last_message_id", ""),
            )
            entries.append((dirname, entry))
            names.append(f"{prefix}/{key}/{dirname}")
        await index.set_dir(virtual_key, entries)
        return names

    if len(parts) == 2 and parts[1] == "members":
        if index is not None:
            listing = await index.list_dir(virtual_key)
            if listing.entries is not None:
                return listing.entries
            guild_virtual_key = prefix + "/" + parts[0]
            guild_lookup = await index.get(guild_virtual_key)
            if guild_lookup.entry is None:
                # Auto-bootstrap: populate guild index.
                root = PathSpec(
                    original=prefix or "/",
                    directory=prefix or "/",
                    prefix=prefix,
                )
                await readdir(accessor, root, index)
                guild_lookup = await index.get(guild_virtual_key)
            if guild_lookup.entry is None:
                raise FileNotFoundError(path)
            guild_id = guild_lookup.entry.id
        else:
            raise FileNotFoundError(path)
        members = await list_members(accessor.config, guild_id)
        entries = []
        names = []
        for m in members:
            filename = _member_filename(m)
            user = m.get("user", {})
            entry = IndexEntry(
                id=user.get("id", ""),
                name=user.get("username", ""),
                resource_type="discord/member",
                vfs_name=filename,
            )
            entries.append((filename, entry))
            names.append(f"{prefix}/{key}/{filename}")
        await index.set_dir(virtual_key, entries)
        return names

    if len(parts) == 3 and parts[1] == "channels":
        if index is not None:
            listing = await index.list_dir(virtual_key)
            if listing.entries is not None:
                return listing.entries
            ch_lookup = await index.get(virtual_key)
            if ch_lookup.entry is None:
                # Auto-bootstrap: populate channel index by listing
                # the parent guild/channels directory first.
                parent = PathSpec(
                    original=prefix + "/" + "/".join(parts[:2]),
                    directory=prefix + "/" + "/".join(parts[:2]),
                    prefix=prefix,
                )
                await readdir(accessor, parent, index)
                ch_lookup = await index.get(virtual_key)
            if ch_lookup.entry is None:
                raise FileNotFoundError(path)
            last_msg_id = ch_lookup.entry.remote_time
        else:
            last_msg_id = ""
        if last_msg_id:
            end_date = _snowflake_to_date(last_msg_id)
        else:
            from datetime import datetime, timezone
            end_date = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
        dates = _date_range(end_date)
        entries = []
        names = []
        for d in dates:
            filename = f"{d}.jsonl"
            entry = IndexEntry(
                id=f"{key}:{d}",
                name=d,
                resource_type="discord/history",
                vfs_name=filename,
            )
            entries.append((filename, entry))
            names.append(f"{prefix}/{key}/{filename}")
        if index is not None:
            await index.set_dir(virtual_key, entries)
        return names

    return []
