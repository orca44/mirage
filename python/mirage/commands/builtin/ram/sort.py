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
from mirage.commands.builtin.sort_helper import _sort_key
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ram.glob import resolve_glob
from mirage.core.ram.read import read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("sort", resource="ram", spec=SPECS["sort"])
async def sort(
    accessor: RAMAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    r: bool = False,
    n: bool = False,
    u: bool = False,
    f: bool = False,
    k: str | None = None,
    t: str | None = None,
    h: bool = False,
    V: bool = False,
    s: bool = False,
    M: bool = False,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    key_field = int(k) if k is not None else None
    if paths and accessor.store is not None:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        all_lines: list[str] = []
        for p in paths:
            data = (await read_bytes(accessor, p)).decode(errors="replace")
            all_lines.extend(data.splitlines())
        all_lines.sort(
            key=lambda x: _sort_key(x, key_field, t, f, n, h, V, M),
            reverse=r,
        )
        if u:
            seen: set[str] = set()
            deduped: list[str] = []
            for ln in all_lines:
                if ln not in seen:
                    seen.add(ln)
                    deduped.append(ln)
            all_lines = deduped
        output = "\n".join(all_lines)
        return (output + "\n").encode() if output else b"", IOResult()
    raw = await _read_stdin_async(stdin)
    if raw is None:
        raise ValueError("sort: missing operand")
    lines = raw.decode(errors="replace").splitlines()
    lines.sort(
        key=lambda x: _sort_key(x, key_field, t, f, n, h, V, M),
        reverse=r,
    )
    if u:
        seen: set[str] = set()
        deduped: list[str] = []
        for ln in lines:
            if ln not in seen:
                seen.add(ln)
                deduped.append(ln)
        lines = deduped
    output = "\n".join(lines)
    return (output + "\n").encode() if output else b"", IOResult()
