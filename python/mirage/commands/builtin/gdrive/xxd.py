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

from mirage.accessor.gdrive import GDriveAccessor
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.gdrive.glob import resolve_glob
from mirage.core.gdrive.read import read as gdrive_read
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _xxd_dump(data: bytes, cols: int, group: int, uppercase: bool) -> bytes:
    fmt = "{:02X}" if uppercase else "{:02x}"
    offset_fmt = "{:08X}: " if uppercase else "{:08x}: "
    lines: list[str] = []
    for offset in range(0, len(data), cols):
        row = data[offset:offset + cols]
        hex_parts: list[str] = []
        for g in range(0, len(row), group):
            hex_parts.append("".join(fmt.format(b) for b in row[g:g + group]))
        hex_part = " ".join(hex_parts)
        ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
        line = offset_fmt.format(
            offset
        ) + f"{hex_part:<{cols * 2 + (cols // group) - 1}}  {ascii_part}"
        lines.append(line)
    return ("\n".join(lines) + "\n").encode() if lines else b""


def _xxd_plain(data: bytes, uppercase: bool) -> bytes:
    h = binascii.hexlify(data)
    return (h.upper() if uppercase else h) + b"\n"


def _xxd_reverse(data: bytes) -> bytes:
    text = data.decode(errors="replace").replace("\n", "").replace(" ", "")
    return binascii.unhexlify(text)


@command("xxd", resource="gdrive", spec=SPECS["xxd"])
async def xxd(
    accessor: GDriveAccessor,
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
    if paths:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        p0 = paths[0]
        raw = await gdrive_read(
            accessor,
            p0.original,
            _extra.get("index"),
        )
    else:
        raw = await _read_stdin_async(stdin)
        if raw is None:
            raise ValueError("xxd: missing input")

    skip = int(s) if s and s is not True else 0
    limit = int(args_l) if args_l and args_l is not True else 0
    if skip:
        raw = raw[skip:]
    if limit:
        raw = raw[:limit]

    if r:
        return _xxd_reverse(raw), IOResult()
    if p:
        return _xxd_plain(raw, uppercase=u), IOResult()

    cols = int(c) if c and c is not True else 16
    group = int(g) if g and g is not True else 2
    return _xxd_dump(raw, cols=cols, group=group, uppercase=u), IOResult()
