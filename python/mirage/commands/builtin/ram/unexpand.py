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
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ram.glob import resolve_glob
from mirage.core.ram.read import read_bytes as _read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _unexpand_line(line: str, tabsize: int, all_spaces: bool) -> str:
    if all_spaces:
        result: list[str] = []
        i = 0
        while i < len(line):
            count = 0
            while i + count < len(line) and line[i + count] == " ":
                count += 1
            if count >= tabsize:
                tabs = count // tabsize
                remainder = count % tabsize
                result.append("\t" * tabs + " " * remainder)
                i += count
            elif count > 0:
                result.append(" " * count)
                i += count
            else:
                result.append(line[i])
                i += 1
        return "".join(result)
    leading = 0
    while leading < len(line) and line[leading] == " ":
        leading += 1
    if leading >= tabsize:
        tabs = leading // tabsize
        remainder = leading % tabsize
        return "\t" * tabs + " " * remainder + line[leading:]
    return line


@command("unexpand", resource="ram", spec=SPECS["unexpand"])
async def unexpand(
    accessor: RAMAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    t: str | None = None,
    a: bool = False,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    tabsize = int(t) if t is not None else 8
    if paths and accessor.store is not None:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        all_text: list[str] = []
        for p in paths:
            data = (await _read_bytes(accessor, p)).decode(errors="replace")
            lines = data.splitlines(True)
            all_text.extend(_unexpand_line(ln, tabsize, a) for ln in lines)
        return "".join(all_text).encode(), IOResult()
    raw = await _read_stdin_async(stdin)
    if raw is None:
        raise ValueError("unexpand: missing operand")
    lines = raw.decode(errors="replace").splitlines(True)
    result = [_unexpand_line(ln, tabsize, a) for ln in lines]
    return "".join(result).encode(), IOResult()
