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

from mirage.accessor.ssh import SSHAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.sort_helper import _sort_key
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ssh.glob import resolve_glob
from mirage.core.ssh.read import read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("sort", resource="ssh", spec=SPECS["sort"])
async def sort(
    accessor: SSHAccessor,
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
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    key_field = int(k) if k is not None else None
    if paths:
        paths = await resolve_glob(accessor, paths, index)
        data = await read_bytes(accessor, paths[0])
        lines = data.decode(errors="replace").splitlines()
        result = sorted(
            lines,
            key=lambda line: _sort_key(line, key_field, t, f, n, h, V, M),
            reverse=r,
        )
        if u:
            seen: set[object] = set()
            deduped: list[str] = []
            for line in result:
                ky = _sort_key(line, key_field, t, f, n, h, V, M)
                if ky not in seen:
                    seen.add(ky)
                    deduped.append(line)
            result = deduped
        output = "\n".join(result)
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
        seen_s: set[str] = set()
        deduped_s: list[str] = []
        for ln in lines:
            if ln not in seen_s:
                seen_s.add(ln)
                deduped_s.append(ln)
        lines = deduped_s
    output = "\n".join(lines)
    return (output + "\n").encode() if output else b"", IOResult()
