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

import posixpath

from mirage.accessor.disk import DiskAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.disk.glob import resolve_glob
from mirage.core.disk.stat import stat as stat_impl
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


async def _exists(accessor: DiskAccessor, path: str) -> bool:
    try:
        await stat_impl(accessor, path)
        return True
    except (FileNotFoundError, ValueError):
        return False


@command("realpath", resource="disk", spec=SPECS["realpath"])
async def realpath(
    accessor: DiskAccessor,
    paths: list[PathSpec] | None = None,
    *texts: str,
    stdin: bytes | None = None,
    e: bool = False,
    m: bool = False,
    prefix: str = "",
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if paths:
        paths = await resolve_glob(accessor, paths, index)
    lines: list[str] = []
    for p in (paths or []):
        resolved_display = posixpath.normpath(p.original)
        if e:
            resolved_inner = posixpath.normpath(p.strip_prefix)
            if not await _exists(accessor, resolved_inner):
                raise FileNotFoundError(
                    f"realpath: '{p.original}': No such file or directory")
        lines.append(resolved_display)
    return ("\n".join(lines) + "\n").encode(), IOResult()
