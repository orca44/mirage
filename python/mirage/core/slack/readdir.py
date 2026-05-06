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

from datetime import datetime, timedelta, timezone

from mirage.accessor.slack import SlackAccessor
from mirage.cache.index import IndexCacheStore, IndexEntry
from mirage.core.slack._client import slack_get
from mirage.core.slack.channels import list_channels, list_dms
from mirage.core.slack.files import file_blob_name
from mirage.core.slack.history import fetch_messages_for_day
from mirage.core.slack.users import list_users
from mirage.types import PathSpec
from mirage.utils.sanitize import sanitize_name

VIRTUAL_ROOTS = ("channels", "dms", "users")


def _channel_dirname(ch: dict) -> str:
    name = sanitize_name(ch.get("name", ch.get("id", "unknown")))
    return f"{name}__{ch['id']}"


def _dm_dirname(
    dm: dict,
    user_map: dict[str, str],
) -> str:
    user_id = dm.get("user", "")
    name = sanitize_name(user_map.get(user_id, user_id))
    return f"{name}__{dm['id']}"


def _user_filename(u: dict) -> str:
    name = sanitize_name(u.get("name", u.get("id", "unknown")))
    return f"{name}__{u['id']}.json"


def _date_range(latest_ts: float,
                created: int,
                max_days: int = 90) -> list[str]:
    end = datetime.fromtimestamp(latest_ts, tz=timezone.utc).date()
    start = datetime.fromtimestamp(created, tz=timezone.utc).date()
    if (end - start).days > max_days:
        start = end - timedelta(days=max_days - 1)
    dates = []
    d = end
    while d >= start:
        dates.append(d.isoformat())
        d -= timedelta(days=1)
    return dates


async def _latest_message_ts(config, channel_id: str) -> float | None:
    data = await slack_get(config,
                           "conversations.history",
                           params={
                               "channel": channel_id,
                               "limit": 1,
                           })
    messages = data.get("messages", [])
    if messages:
        return float(messages[0].get("ts", "0"))
    return None


async def readdir(
    accessor: SlackAccessor,
    path: PathSpec,
    index: IndexCacheStore = None,
) -> list[str]:
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    if isinstance(path, PathSpec):
        prefix = path.prefix
        path = path.directory if path.pattern else path.original
    if prefix and path.startswith(prefix):
        path = path[len(prefix):] or "/"
    key = path.strip("/")
    virtual_key = prefix + "/" + key if key else prefix or "/"

    if not key:
        return [f"{prefix}/channels", f"{prefix}/dms", f"{prefix}/users"]

    if key == "channels":
        if index is not None:
            listing = await index.list_dir(virtual_key)
            if listing.entries is not None:
                return listing.entries
        channels = await list_channels(accessor.config)
        entries = []
        names = []
        for ch in channels:
            dirname = _channel_dirname(ch)
            entry = IndexEntry(
                id=ch["id"],
                name=ch.get("name", ""),
                resource_type="slack/channel",
                vfs_name=dirname,
                remote_time=str(ch.get("created", 0)),
            )
            entries.append((dirname, entry))
            names.append(f"{prefix}/channels/{dirname}")
        if index is not None:
            await index.set_dir(virtual_key, entries)
        return names

    if key == "dms":
        if index is not None:
            listing = await index.list_dir(virtual_key)
            if listing.entries is not None:
                return listing.entries
        dms = await list_dms(accessor.config)
        users = await list_users(accessor.config)
        user_map = {u["id"]: u.get("name", u["id"]) for u in users}
        entries = []
        names = []
        for dm in dms:
            dirname = _dm_dirname(dm, user_map)
            uid = dm.get("user", "")
            entry = IndexEntry(
                id=dm["id"],
                name=user_map.get(uid, uid),
                resource_type="slack/dm",
                vfs_name=dirname,
                remote_time=str(dm.get("created", 0)),
            )
            entries.append((dirname, entry))
            names.append(f"{prefix}/dms/{dirname}")
        if index is not None:
            await index.set_dir(virtual_key, entries)
        return names

    if key == "users":
        if index is not None:
            listing = await index.list_dir(virtual_key)
            if listing.entries is not None:
                return listing.entries
        users = await list_users(accessor.config)
        entries = []
        names = []
        for u in users:
            filename = _user_filename(u)
            entry = IndexEntry(
                id=u["id"],
                name=u.get("name", ""),
                resource_type="slack/user",
                vfs_name=filename,
            )
            entries.append((filename, entry))
            names.append(f"{prefix}/users/{filename}")
        if index is not None:
            await index.set_dir(virtual_key, entries)
        return names

    parts = key.split("/")
    if len(parts) == 2 and parts[0] in ("channels", "dms"):
        if index is None:
            raise FileNotFoundError(path)
        lookup = await index.get(virtual_key)
        if lookup.entry is None:
            # Auto-bootstrap: populate parent directory index.
            parent = PathSpec(
                original=prefix + "/" + parts[0],
                directory=prefix + "/" + parts[0],
                prefix=prefix,
            )
            await readdir(accessor, parent, index)
            lookup = await index.get(virtual_key)
        if lookup.entry is None:
            raise FileNotFoundError(path)
        listing = await index.list_dir(virtual_key)
        if listing.entries is not None:
            return listing.entries
        created = int(lookup.entry.remote_time or 0)
        latest_ts = await _latest_message_ts(accessor.config, lookup.entry.id)
        if latest_ts and created:
            dates = _date_range(latest_ts, created)
        elif latest_ts:
            dates = _date_range(latest_ts, int(latest_ts))
        else:
            dates = []
        entries = []
        names = []
        for d in dates:
            entry = IndexEntry(
                id=f"{lookup.entry.id}:{d}",
                name=d,
                resource_type="slack/date_dir",
                vfs_name=d,
            )
            entries.append((d, entry))
            names.append(f"{prefix}/{key}/{d}")
        await index.set_dir(virtual_key, entries)
        return names

    if len(parts) == 3 and parts[0] in ("channels", "dms"):
        if index is None:
            raise FileNotFoundError(path)
        cached = await index.list_dir(virtual_key)
        if cached.entries is not None:
            return cached.entries
        parent_vk = prefix + "/" + parts[0] + "/" + parts[1]
        parent_lookup = await index.get(parent_vk)
        if parent_lookup.entry is None:
            parent = PathSpec(
                original=prefix + "/" + parts[0] + "/" + parts[1],
                directory=prefix + "/" + parts[0] + "/" + parts[1],
                prefix=prefix,
            )
            await readdir(accessor, parent, index)
            parent_lookup = await index.get(parent_vk)
        if parent_lookup.entry is None:
            raise FileNotFoundError(path)
        channel_id = parent_lookup.entry.id
        date_str = parts[2]
        await _fetch_day(accessor, channel_id, date_str, virtual_key, index)
        cached = await index.list_dir(virtual_key)
        if cached.entries is not None:
            return cached.entries
        raise FileNotFoundError(path)

    if (len(parts) == 4 and parts[0] in ("channels", "dms")
            and parts[3] == "files"):
        if index is None:
            raise FileNotFoundError(path)
        cached = await index.list_dir(virtual_key)
        if cached.entries is not None:
            return cached.entries
        date_path = PathSpec(
            original=prefix + "/" + "/".join(parts[:3]),
            directory=prefix + "/" + "/".join(parts[:3]),
            prefix=prefix,
        )
        await readdir(accessor, date_path, index)
        cached = await index.list_dir(virtual_key)
        if cached.entries is not None:
            return cached.entries
        raise FileNotFoundError(path)

    return []


async def _fetch_messages_for_day(
    accessor: SlackAccessor,
    channel_id: str,
    date_str: str,
) -> list[dict]:
    return await fetch_messages_for_day(accessor.config, channel_id, date_str)


async def _fetch_day(
    accessor: SlackAccessor,
    channel_id: str,
    date_str: str,
    date_vkey: str,
    index: IndexCacheStore,
) -> None:
    messages = await _fetch_messages_for_day(accessor, channel_id, date_str)
    chat_entry = IndexEntry(
        id=f"{channel_id}:{date_str}:chat",
        name="chat.jsonl",
        resource_type="slack/chat_jsonl",
        vfs_name="chat.jsonl",
    )
    files_entry = IndexEntry(
        id=f"{channel_id}:{date_str}:files",
        name="files",
        resource_type="slack/files_dir",
        vfs_name="files",
    )
    await index.set_dir(date_vkey, [
        ("chat.jsonl", chat_entry),
        ("files", files_entry),
    ])
    file_entries: list[tuple[str, IndexEntry]] = []
    for msg in messages:
        for fmeta in msg.get("files", []) or []:
            if not fmeta.get("id"):
                continue
            blob_name = file_blob_name(fmeta)
            file_entries.append(
                (blob_name,
                 IndexEntry(
                     id=fmeta["id"],
                     name=fmeta.get("title") or fmeta.get("name") or "",
                     resource_type="slack/file",
                     vfs_name=blob_name,
                     size=fmeta.get("size"),
                     remote_time=str(fmeta.get("timestamp", "")),
                     extra={
                         "mimetype":
                         fmeta.get("mimetype", ""),
                         "url_private_download":
                         fmeta.get("url_private_download", ""),
                         "filetype":
                         fmeta.get("filetype", ""),
                         "ts":
                         msg.get("ts", ""),
                         "channel_id":
                         channel_id,
                         "date":
                         date_str,
                     },
                 )))
    await index.set_dir(date_vkey + "/files", file_entries)
