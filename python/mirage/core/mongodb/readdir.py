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

from mirage.accessor.mongodb import MongoDBAccessor
from mirage.cache.index import IndexCacheStore, IndexEntry
from mirage.core.mongodb._client import list_collections, list_databases
from mirage.types import PathSpec


def _is_single_db(config) -> bool:
    return config.databases is not None and len(config.databases) == 1


async def readdir(
    accessor: MongoDBAccessor,
    path: PathSpec,
    index: IndexCacheStore = None,
) -> list[str]:
    """List directory contents.

    Args:
        accessor (MongoDBAccessor): mongodb accessor.
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

    if key and any(p.startswith(".") for p in key.split("/")):
        raise FileNotFoundError(path)

    virtual_key = prefix + "/" + key if key else prefix or "/"

    if not key:
        if _is_single_db(accessor.config):
            return await _readdir_collections(
                accessor,
                accessor.config.databases[0],
                virtual_key,
                index,
                prefix,
            )
        if index is not None:
            listing = await index.list_dir(virtual_key)
            if listing.entries is not None:
                return listing.entries
        dbs = await list_databases(accessor.client, accessor.config)
        entries = []
        names = []
        for db_name in dbs:
            entry = IndexEntry(
                id=db_name,
                name=db_name,
                resource_type="mongodb/database",
                vfs_name=db_name,
            )
            entries.append((db_name, entry))
            names.append(f"{prefix}/{db_name}")
        if index is not None:
            await index.set_dir(virtual_key, entries)
        return names

    parts = key.split("/")

    if len(parts) == 1:
        return await _readdir_collections(
            accessor,
            parts[0],
            virtual_key,
            index,
            prefix,
        )

    raise FileNotFoundError(path)


async def _readdir_collections(
    accessor: MongoDBAccessor,
    db_name: str,
    virtual_key: str,
    index: IndexCacheStore | None,
    prefix: str,
) -> list[str]:
    if index is not None:
        listing = await index.list_dir(virtual_key)
        if listing.entries is not None:
            return listing.entries
    collections = await list_collections(accessor.client, db_name)
    entries = []
    names = []
    for col_name in collections:
        filename = f"{col_name}.jsonl"
        entry = IndexEntry(
            id=col_name,
            name=col_name,
            resource_type="mongodb/collection",
            vfs_name=filename,
        )
        entries.append((filename, entry))
        full_path = f"{prefix}/{db_name}/{filename}"
        if _is_single_db(accessor.config):
            full_path = f"{prefix}/{filename}"
        names.append(full_path)
    if index is not None:
        await index.set_dir(virtual_key, entries)
    return names
