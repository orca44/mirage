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
from itertools import zip_longest

from mirage.accessor.disk import DiskAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.disk.glob import resolve_glob
from mirage.core.disk.read import read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("paste", resource="disk", spec=SPECS["paste"])
async def paste(
    accessor: DiskAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    d: str | None = None,
    s: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    delimiter = d if d else "\t"
    file_lines: list[list[str]] = []

    paths = await resolve_glob(accessor, paths, index)
    for p in paths:
        if p.original == "-":
            raw = await _read_stdin_async(stdin)
            data = raw.decode(errors="replace") if raw else ""
            stdin = None
        elif accessor.root is not None:
            data = (await read_bytes(accessor, p)).decode(errors="replace")
        else:
            continue
        file_lines.append(data.splitlines())

    if not file_lines and stdin is not None:
        raw = await _read_stdin_async(stdin)
        if raw:
            file_lines.append(raw.decode(errors="replace").splitlines())

    if not file_lines:
        raise ValueError("paste: missing operand")

    if s:
        out_lines = [delimiter.join(lines) for lines in file_lines]
    else:
        out_lines = [
            delimiter.join(row)
            for row in zip_longest(*file_lines, fillvalue="")
        ]

    return ("\n".join(out_lines) + "\n").encode(), IOResult()
