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

from mirage.accessor.ram import RAMAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.aggregators import header_aggregate
from mirage.commands.builtin.tail_helper import _parse_n, tail_bytes
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ram.glob import resolve_glob
from mirage.core.ram.read import read_bytes as _read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("tail",
         resource="ram",
         spec=SPECS["tail"],
         aggregate=header_aggregate)
async def tail(
    accessor: RAMAccessor,
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
    if paths and accessor.store is not None:
        paths = await resolve_glob(accessor, paths, index)
        chunks: list[bytes] = []
        cache: list[str] = []
        show_headers = (v or len(paths) > 1) and not q
        for i, p in enumerate(paths):
            raw = await _read_bytes(accessor, p)
            if show_headers:
                header = f"==> {p.original} <==\n"
                if i > 0:
                    header = "\n" + header
                chunks.append(header.encode())
            if bytes_mode is not None:
                chunks.append(raw[-bytes_mode:] if bytes_mode else b"")
                if bytes_mode >= len(raw):
                    cache.append(p.original)
            else:
                chunks.append(tail_bytes(raw, lines, plus_mode=plus_mode))
                if not plus_mode and lines >= raw.count(b"\n"):
                    cache.append(p.original)
        return b"".join(chunks), IOResult(cache=cache)
    raw = await _read_stdin_async(stdin)
    if raw is None:
        raise ValueError("tail: missing operand")
    if bytes_mode is not None:
        return raw[-bytes_mode:], IOResult()
    return tail_bytes(raw, lines, plus_mode=plus_mode), IOResult()
