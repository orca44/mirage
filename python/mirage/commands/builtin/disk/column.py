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
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.disk.glob import resolve_glob
from mirage.core.disk.read import read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _table_format(text: str,
                  separator: str | None,
                  output_sep: str = "  ") -> str:
    lines = text.splitlines()
    if not lines:
        return ""
    rows: list[list[str]] = []
    for line in lines:
        if separator:
            rows.append(line.split(separator))
        else:
            rows.append(line.split())
    if not rows:
        return ""
    max_cols = max(len(r) for r in rows)
    widths = [0] * max_cols
    for row in rows:
        for idx, cell in enumerate(row):
            if len(cell) > widths[idx]:
                widths[idx] = len(cell)
    out: list[str] = []
    for row in rows:
        parts: list[str] = []
        for idx, cell in enumerate(row):
            if idx < len(row) - 1:
                parts.append(cell.ljust(widths[idx]))
            else:
                parts.append(cell)
        out.append(output_sep.join(parts))
    return "\n".join(out) + "\n"


@command("column", resource="disk", spec=SPECS["column"])
async def column(
    accessor: DiskAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    t: bool = False,
    s: str | None = None,
    o: str | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if paths and accessor.root is not None:
        paths = await resolve_glob(accessor, paths, index)
        raw = await read_bytes(accessor, paths[0])
    else:
        raw = await _read_stdin_async(stdin)
        if raw is None:
            raise ValueError("column: missing input")
    text = raw.decode(errors="replace")
    if t:
        output = _table_format(text, s, o if o is not None else "  ")
    else:
        output = text
    return output.encode(), IOResult()
