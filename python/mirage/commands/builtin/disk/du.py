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

from mirage.accessor.disk import DiskAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.utils.formatting import _human_size
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.disk.du import du as du_impl
from mirage.core.disk.du import du_all as du_all_impl
from mirage.core.disk.glob import resolve_glob
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _format_size(size: int, human: bool) -> str:
    return _human_size(size) if human else str(size)


def _depth(entry_path: str, base_path: str) -> int:
    base = base_path.rstrip("/")
    rel = entry_path.rstrip("/")[len(base):]
    if not rel:
        return 0
    return rel.strip("/").count("/") + 1


@command("du", resource="disk", spec=SPECS["du"])
async def du(
    accessor: DiskAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    h: bool = False,
    s: bool = False,
    a: bool = False,
    max_depth: str | None = None,
    c: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if accessor.root is None:
        raise ValueError("du: no resource")
    paths = await resolve_glob(accessor, paths, index)
    path = paths[0]
    if s:
        total = await du_impl(accessor, path)
        output = _format_size(total, h) + "\t" + path.original
        if c:
            output += "\n" + _format_size(total, h) + "\ttotal"
        return output.encode(), IOResult()
    all_entries, _total = await du_all_impl(accessor, path)
    if not all_entries:
        total = await du_impl(accessor, path)
        output = _format_size(total, h) + "\t" + path.original
        if c:
            output += "\n" + _format_size(total, h) + "\ttotal"
        return output.encode(), IOResult()
    if not a:
        dir_entries: list[tuple[str, int]] = []
        for p, sz in all_entries:
            if p == path.original:
                dir_entries.append((p, sz))
        all_entries = dir_entries
    if max_depth is not None:
        md = int(max_depth)
        all_entries = [(p, sz) for p, sz in all_entries
                       if _depth(p, path.original) <= md]
    if not all_entries:
        total = _total if _total else await du_impl(accessor, path)
        output = _format_size(total, h) + "\t" + path.original
        if c:
            output += "\n" + _format_size(total, h) + "\ttotal"
        return output.encode(), IOResult()
    lines = [_format_size(sz, h) + "\t" + p for p, sz in all_entries]
    if c:
        grand = sum(sz for _, sz in all_entries)
        lines.append(_format_size(grand, h) + "\ttotal")
    return "\n".join(lines).encode(), IOResult()
