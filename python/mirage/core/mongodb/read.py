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

from bson.json_util import default

from mirage.accessor.mongodb import MongoDBAccessor
from mirage.cache.index import IndexCacheStore
from mirage.core.mongodb._client import find_documents
from mirage.types import PathSpec


def _parse_collection_path(key: str, config) -> tuple[str, str]:
    single_db = config.databases is not None and len(config.databases) == 1
    parts = key.split("/")
    if single_db and len(parts) == 1 and parts[0].endswith(".jsonl"):
        return config.databases[0], parts[0].removesuffix(".jsonl")
    if len(parts) == 2 and parts[1].endswith(".jsonl"):
        return parts[0], parts[1].removesuffix(".jsonl")
    raise FileNotFoundError(key)


async def read(
    accessor: MongoDBAccessor,
    path: PathSpec,
    index: IndexCacheStore = None,
) -> bytes:
    """Read a collection as JSONL.

    Args:
        accessor (MongoDBAccessor): mongodb accessor.
        path (str): resource-relative path.
        index (IndexCacheStore | None): index cache.
        prefix (str): mount prefix for virtual index keys.
    """
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    if isinstance(path, PathSpec):
        prefix = path.prefix
        path = path.original

    if prefix and path.startswith(prefix):
        path = path[len(prefix):] or "/"
    key = path.strip("/")

    if any(p.startswith(".") for p in key.split("/")):
        raise FileNotFoundError(path)

    db_name, col_name = _parse_collection_path(key, accessor.config)
    limit = accessor.config.default_doc_limit
    docs = await find_documents(
        accessor.client,
        db_name,
        col_name,
        sort=[("_id", 1)],
        limit=limit,
    )
    lines = []
    for doc in docs:
        doc["_id"] = str(doc["_id"])
        lines.append(json.dumps(doc, ensure_ascii=False, default=default))
    if not lines:
        return b""
    return ("\n".join(lines) + "\n").encode()
