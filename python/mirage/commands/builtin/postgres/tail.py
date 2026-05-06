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

import orjson

from mirage.accessor.postgres import PostgresAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.postgres._provision import file_read_provision
from mirage.commands.builtin.tail_helper import _parse_n, tail_bytes
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.postgres import _client
from mirage.core.postgres.glob import resolve_glob
from mirage.core.postgres.read import read as postgres_read
from mirage.core.postgres.scope import detect_scope
from mirage.io.types import ByteSource, IOResult
from mirage.provision.types import ProvisionResult
from mirage.types import PathSpec


async def tail_provision(
    accessor: PostgresAccessor,
    paths: list[PathSpec],
    *texts: str,
    **_extra: object,
) -> ProvisionResult:
    return await file_read_provision(
        accessor, paths,
        "tail " + " ".join(p.original if isinstance(p, PathSpec) else p
                           for p in paths))


async def _tail_result(raw: bytes, lines: int, plus_mode: bool,
                       bytes_mode: int | None) -> AsyncIterator[bytes]:
    if bytes_mode is not None:
        yield raw[-bytes_mode:] if bytes_mode else b""
        return
    yield tail_bytes(raw, lines, plus_mode=plus_mode)


@command("tail",
         resource="postgres",
         spec=SPECS["tail"],
         provision=tail_provision)
async def tail(
    accessor: PostgresAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    n: str | None = None,
    c: str | None = None,
    q: bool = False,
    v: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    lines, plus_mode = _parse_n(n)
    bytes_mode = int(c) if c is not None else None
    if paths:
        scope = detect_scope(paths[0])
        is_file = scope.level == "entity_rows"
        if is_file and not bytes_mode:
            limit = min(lines, accessor.config.default_row_limit)
            pool = await accessor.pool()
            async with pool.acquire() as conn:
                total = await _client.count_rows(conn, scope.schema,
                                                 scope.entity)
                offset = max(0, total - limit)
                rows = await _client.fetch_rows(conn,
                                                scope.schema,
                                                scope.entity,
                                                limit=limit,
                                                offset=offset)
            if not rows:
                return _tail_result(b"", lines, plus_mode, None), IOResult()
            jsonl = "\n".join(
                orjson.dumps(r, default=str).decode() for r in rows) + "\n"
            return _tail_result(jsonl.encode(), lines, plus_mode,
                                None), IOResult()

        paths = await resolve_glob(accessor, paths, index=index)
        p = paths[0]
        raw = await postgres_read(accessor, p, index)
        return _tail_result(raw, lines, plus_mode, bytes_mode), IOResult()
    raw = await _read_stdin_async(stdin)
    if raw is None:
        raise ValueError("tail: missing operand")
    return _tail_result(raw, lines, plus_mode, bytes_mode), IOResult()
