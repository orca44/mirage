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

import binascii
from collections.abc import AsyncIterator

from mirage.accessor.ram import RAMAccessor
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ram.glob import resolve_glob
from mirage.core.ram.stream import stream as _stream_core
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


async def _xxd_dump_stream(source: AsyncIterator[bytes],
                           cols: int = 16,
                           group: int = 2,
                           uppercase: bool = False) -> AsyncIterator[bytes]:
    fmt = "{:02X}" if uppercase else "{:02x}"
    offset_fmt = "{:08X}: " if uppercase else "{:08x}: "
    offset = 0
    leftover = b""
    async for chunk in source:
        data = leftover + chunk
        i = 0
        while i + cols <= len(data):
            row = data[i:i + cols]
            hex_parts: list[str] = []
            for g in range(0, len(row), group):
                hex_parts.append("".join(
                    fmt.format(b) for b in row[g:g + group]))
            hex_part = " ".join(hex_parts)
            ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
            line = offset_fmt.format(
                offset
            ) + f"{hex_part:<{cols * 2 + (cols // group) - 1}}  {ascii_part}\n"
            yield line.encode()
            offset += cols
            i += cols
        leftover = data[i:]
    if leftover:
        hex_parts = []
        for g in range(0, len(leftover), group):
            hex_parts.append("".join(
                fmt.format(b) for b in leftover[g:g + group]))
        hex_part = " ".join(hex_parts)
        ascii_part = "".join(
            chr(b) if 32 <= b < 127 else "." for b in leftover)
        line = offset_fmt.format(
            offset
        ) + f"{hex_part:<{cols * 2 + (cols // group) - 1}}  {ascii_part}\n"
        yield line.encode()


async def _xxd_plain_stream(source: AsyncIterator[bytes],
                            uppercase: bool = False) -> AsyncIterator[bytes]:
    async for chunk in source:
        h = binascii.hexlify(chunk)
        yield h.upper() if uppercase else h
    yield b"\n"


async def _xxd_reverse_stream(
        source: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
    buf = b""
    async for chunk in source:
        buf += chunk
    text = buf.decode(errors="replace").replace("\n", "").replace(" ", "")
    yield binascii.unhexlify(text)


async def _apply_limits(source: AsyncIterator[bytes], skip: int,
                        limit: int) -> AsyncIterator[bytes]:
    pos = 0
    remaining = limit
    async for chunk in source:
        chunk_len = len(chunk)
        if pos + chunk_len <= skip:
            pos += chunk_len
            continue
        if pos < skip:
            chunk = chunk[skip - pos:]
            pos = skip
        if remaining <= 0:
            break
        if len(chunk) > remaining:
            chunk = chunk[:remaining]
        yield chunk
        remaining -= len(chunk)
        pos += len(chunk)


@command("xxd", resource="ram", spec=SPECS["xxd"])
async def xxd(
    accessor: RAMAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    r: bool = False,
    p: bool = False,
    args_l: str | bool = False,
    c: str | bool = False,
    s: str | bool = False,
    g: str | bool = False,
    u: bool = False,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    cache: list[str] = []
    if paths and accessor.store is not None:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        source: AsyncIterator[bytes] = _stream_core(accessor, paths[0])
        cache = [paths[0].original]
    else:
        source = _resolve_source(stdin, "xxd: missing input")

    skip = int(s) if s and s is not True else 0
    limit = int(args_l) if args_l and args_l is not True else 0

    if skip or limit:
        if not limit:
            limit = 2**63
        source = _apply_limits(source, skip, limit)

    if r:
        return _xxd_reverse_stream(source), IOResult(cache=cache)
    if p:
        return _xxd_plain_stream(source, uppercase=u), IOResult(cache=cache)

    cols = int(c) if c and c is not True else 16
    group = int(g) if g and g is not True else 2
    return _xxd_dump_stream(source, cols=cols, group=group,
                            uppercase=u), IOResult(cache=cache)
