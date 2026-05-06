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

from mirage.accessor.redis import RedisAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.aggregators import wc_aggregate
from mirage.commands.builtin.redis._provision import file_read_provision
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.redis.glob import resolve_glob
from mirage.core.redis.read import read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


async def _wc_lines_stream(
        source: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
    count = 0
    async for chunk in source:
        count += chunk.count(b"\n")
    yield str(count).encode()


@command("wc",
         resource="redis",
         spec=SPECS["wc"],
         aggregate=wc_aggregate,
         provision=file_read_provision)
async def wc(
    accessor: RedisAccessor,
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
    if paths and accessor.store is not None:
        paths = await resolve_glob(accessor, paths, index)
        outputs: list[str] = []
        total_lines = total_words = total_bytes = 0
        for p in paths:
            data = await read_bytes(accessor, p)
            text = data.decode(errors="replace")
            line_count = text.count("\n")
            word_count = len(text.split())
            byte_count = len(data)
            if L:
                max_len = max((len(ln) for ln in text.splitlines()), default=0)
                outputs.append(f"{max_len}\t{p.original}")
            elif args_l:
                outputs.append(f"{line_count}\t{p.original}")
                total_lines += line_count
            elif w:
                outputs.append(f"{word_count}\t{p.original}")
                total_words += word_count
            elif c:
                outputs.append(f"{byte_count}\t{p.original}")
                total_bytes += byte_count
            elif m:
                char_count = len(text)
                outputs.append(f"{char_count}\t{p.original}")
                total_bytes += char_count
            else:
                outputs.append(
                    f"{line_count}\t{word_count}\t{byte_count}\t{p.original}")
                total_lines += line_count
                total_words += word_count
                total_bytes += byte_count
        if len(paths) > 1:
            if args_l:
                outputs.append(f"{total_lines}\ttotal")
            elif w:
                outputs.append(f"{total_words}\ttotal")
            elif c:
                outputs.append(f"{total_bytes}\ttotal")
            elif m:
                outputs.append(f"{total_bytes}\ttotal")
            else:
                outputs.append(
                    f"{total_lines}\t{total_words}\t{total_bytes}\ttotal")
        return "\n".join(outputs).encode(), IOResult()

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
