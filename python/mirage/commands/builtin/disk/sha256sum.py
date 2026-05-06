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

import hashlib
from collections.abc import AsyncIterator

from mirage.accessor.disk import DiskAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.disk.glob import resolve_glob
from mirage.core.disk.read import read_bytes as _read_bytes
from mirage.core.disk.stream import read_stream
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


async def _sha256_stream(source: AsyncIterator[bytes],
                         label: str) -> AsyncIterator[bytes]:
    h = hashlib.sha256()
    async for chunk in source:
        h.update(chunk)
    yield (h.hexdigest() + "  " + label + "\n").encode()


async def _sha256_multi(accessor: DiskAccessor,
                        paths: list[PathSpec]) -> AsyncIterator[bytes]:
    for p in paths:
        h = hashlib.sha256()
        async for chunk in read_stream(accessor, p):
            h.update(chunk)
        yield (h.hexdigest() + "  " + p.strip_prefix + "\n").encode()


async def _sha256_check(accessor: DiskAccessor,
                        path: PathSpec | str) -> tuple[bytes, int]:
    data = (await _read_bytes(accessor, path)).decode(errors="replace")
    lines: list[str] = []
    failed = False
    for line in data.splitlines():
        if not line.strip():
            continue
        parts = line.split("  ", 1)
        if len(parts) != 2:
            continue
        expected_hash, filename = parts
        h = hashlib.sha256()
        async for chunk in read_stream(accessor, filename):
            h.update(chunk)
        if h.hexdigest() == expected_hash:
            lines.append(f"{filename}: OK")
        else:
            lines.append(f"{filename}: FAILED")
            failed = True
    return ("\n".join(lines) + "\n").encode(), 1 if failed else 0


@command("sha256sum", resource="disk", spec=SPECS["sha256sum"])
async def sha256sum(
    accessor: DiskAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    c: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if paths and accessor.root is not None:
        paths = await resolve_glob(accessor, paths, index)
    if c and paths and accessor.root is not None:
        out, exit_code = await _sha256_check(accessor, paths[0])
        return out, IOResult(exit_code=exit_code)
    if paths and accessor.root is not None:
        return _sha256_multi(
            accessor, paths), IOResult(cache=[p.original for p in paths])
    source = _resolve_source(stdin, "sha256sum: missing input")
    return _sha256_stream(source, "-"), IOResult()
