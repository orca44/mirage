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

import difflib
import re

from mirage.accessor.disk import DiskAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.diff_helper import _ed_script
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.disk.glob import resolve_glob
from mirage.core.disk.read import read_bytes
from mirage.core.disk.readdir import readdir
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


async def _diff_pair(
    accessor: DiskAccessor,
    path1: PathSpec | str,
    path2: PathSpec | str,
    i: bool,
    w: bool,
    b: bool,
    e: bool,
    q: bool,
) -> bytes:
    label1 = path1.original if isinstance(path1, PathSpec) else path1
    label2 = path2.original if isinstance(path2, PathSpec) else path2
    text_a = (await read_bytes(accessor, path1)).decode(errors="replace")
    text_b = (await read_bytes(accessor, path2)).decode(errors="replace")
    if i:
        text_a = text_a.lower()
        text_b = text_b.lower()
    if w:
        text_a = re.sub(r"\s+", "", text_a)
        text_b = re.sub(r"\s+", "", text_b)
    if b:
        text_a = re.sub(r"[ \t]+", " ", text_a)
        text_b = re.sub(r"[ \t]+", " ", text_b)
    if q:
        if text_a != text_b:
            return f"Files {label1} and {label2} differ\n".encode()
        return b""
    a_lines = text_a.splitlines(keepends=True)
    b_lines = text_b.splitlines(keepends=True)
    if e:
        result = _ed_script(a_lines, b_lines)
    else:
        result = list(
            difflib.unified_diff(a_lines,
                                 b_lines,
                                 fromfile=label1,
                                 tofile=label2))
    return "".join(result).encode()


@command("diff", resource="disk", spec=SPECS["diff"])
async def diff(
    accessor: DiskAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    i: bool = False,
    w: bool = False,
    b: bool = False,
    e: bool = False,
    u: bool = False,
    q: bool = False,
    r: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if accessor.root is None:
        raise ValueError("diff: no resource")
    paths = await resolve_glob(accessor, paths, index)
    if len(paths) < 2:
        raise ValueError("diff: requires two paths")
    paths[0].prefix
    if r:
        entries_a = sorted(await readdir(accessor, paths[0], index))
        entries_b = sorted(await readdir(accessor, paths[1], index))
        names = sorted(set(entries_a) | set(entries_b))
        parts: list[bytes] = []
        for name in names:
            p1 = paths[0].original.rstrip("/") + "/" + name
            p2 = paths[1].original.rstrip("/") + "/" + name
            if name in entries_a and name in entries_b:
                parts.append(await _diff_pair(accessor, p1, p2, i, w, b, e, q))
        output = b"".join(parts)
    else:
        output = await _diff_pair(accessor, paths[0], paths[1], i, w, b, e, q)
    exit_code = 1 if output else 0
    return output, IOResult(exit_code=exit_code,
                            cache=[paths[0].original, paths[1].original])
