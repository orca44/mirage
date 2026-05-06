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
from collections.abc import AsyncIterator

from bson.json_util import default

from mirage.accessor.mongodb import MongoDBAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.mongodb._provision import file_read_provision
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.mongodb._client import find_documents
from mirage.core.mongodb.glob import resolve_glob
from mirage.core.mongodb.read import read as mongodb_read
from mirage.core.mongodb.scope import detect_scope
from mirage.io.types import ByteSource, IOResult
from mirage.provision.types import ProvisionResult
from mirage.types import PathSpec


async def head_provision(
    accessor: MongoDBAccessor,
    paths: list[PathSpec],
    *texts: str,
    **_extra: object,
) -> ProvisionResult:
    return await file_read_provision(
        accessor, paths,
        "head " + " ".join(p.original if isinstance(p, PathSpec) else p
                           for p in paths))


async def _head_bytes(data: bytes, lines: int,
                      bytes_mode: int | None) -> AsyncIterator[bytes]:
    if bytes_mode is not None:
        yield data[:bytes_mode]
        return
    parts = data.split(b"\n", lines)
    yield b"\n".join(parts[:lines])


def _is_single_db(config) -> bool:
    return config.databases is not None and len(config.databases) == 1


def _parse_collection_from_scope(scope, config) -> tuple[str, str] | None:
    if scope.level == "file" and scope.database and scope.collection:
        return scope.database, scope.collection
    return None


@command("head",
         resource="mongodb",
         spec=SPECS["head"],
         provision=head_provision)
async def head(
    accessor: MongoDBAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    n: str | None = None,
    c: str | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    lines = int(n) if n is not None else 10
    bytes_mode = int(c) if c is not None else None
    if paths:
        single_db = _is_single_db(accessor.config)
        single_db_name = accessor.config.databases[0] if single_db else None
        scope = detect_scope(paths[0],
                             single_db=single_db,
                             single_db_name=single_db_name)

        is_file = (scope.level == "file" and scope.database
                   and scope.collection)
        if is_file and not bytes_mode:
            limit = min(lines, accessor.config.max_doc_limit)
            docs = await find_documents(
                accessor.client,
                scope.database,
                scope.collection,
                sort=[("_id", 1)],
                limit=limit,
            )
            for doc in docs:
                doc["_id"] = str(doc["_id"])
            jsonl = "\n".join(
                json.dumps(doc, ensure_ascii=False, default=default)
                for doc in docs) + "\n"
            return _head_bytes(jsonl.encode(), lines, None), IOResult()

        paths = await resolve_glob(accessor, paths, index=index)
        p = paths[0]
        data = await mongodb_read(accessor, p, index)
        return _head_bytes(data, lines, bytes_mode), IOResult()
    raw = await _read_stdin_async(stdin)
    if raw is None:
        raise ValueError("head: missing operand")
    return _head_bytes(raw, lines, bytes_mode), IOResult()
