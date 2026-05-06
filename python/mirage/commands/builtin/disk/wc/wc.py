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

from mirage.accessor.disk import DiskAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.disk.glob import resolve_glob
from mirage.core.disk.read import read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


async def _wc_lines_stream(
        source: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
    count = 0
    async for chunk in source:
        count += chunk.count(b"\n")
    yield str(count).encode()


@command("wc", resource="disk", spec=SPECS["wc"])
async def wc(
    accessor: DiskAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    args_l: bool = False,
    w: bool = False,
    c: bool = False,
    m: bool = False,
    L: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if paths and accessor.root is not None:
        paths = await resolve_glob(accessor, paths, index)
        raw = await read_bytes(accessor, paths[0])
        text = raw.decode(errors="replace")
        lc = text.count("\n")
        wc_val = len(text.split())
        bc = len(raw)
        cc = len(text)
        if L:
            max_len = max((len(ln) for ln in text.splitlines()), default=0)
            return str(max_len).encode(), IOResult()
        if args_l:
            return str(lc).encode(), IOResult()
        if w:
            return str(wc_val).encode(), IOResult()
        if m:
            return str(cc).encode(), IOResult()
        if c:
            return str(bc).encode(), IOResult()
        out = f"{lc}\t{wc_val}\t{bc}"
        return out.encode(), IOResult()

    source: AsyncIterator[bytes] = _resolve_source(stdin,
                                                   "wc: missing operand")

    if args_l:
        return _wc_lines_stream(source), IOResult()

    raw = b""
    async for chunk in source:
        raw += chunk
    text = raw.decode(errors="replace")
    lc = text.count("\n")
    wc_val = len(text.split())
    bc = len(raw)
    cc = len(text)

    if L:
        max_len = max((len(ln) for ln in text.splitlines()), default=0)
        return str(max_len).encode(), IOResult()
    if w:
        return str(wc_val).encode(), IOResult()
    if m:
        return str(cc).encode(), IOResult()
    if c:
        return str(bc).encode(), IOResult()
    return f"{lc}\t{wc_val}\t{bc}".encode(), IOResult()
