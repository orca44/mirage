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

from mirage.accessor.ram import RAMAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ram.glob import resolve_glob
from mirage.core.ram.read import read as read_fn
from mirage.core.ram.readdir import readdir
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _ed_script(a_lines: list[str], b_lines: list[str]) -> list[str]:
    sm = difflib.SequenceMatcher(None, a_lines, b_lines)
    edits: list[str] = []
    for tag, i1, i2, j1, j2 in reversed(sm.get_opcodes()):
        if tag == "equal":
            continue
        if tag == "delete":
            addr = f"{i1 + 1},{i2}" if i2 - i1 > 1 else f"{i1 + 1}"
            edits.append(f"{addr}d\n")
        elif tag == "insert":
            edits.append(f"{i1}a\n")
            for line in b_lines[j1:j2]:
                edits.append(line if line.endswith("\n") else line + "\n")
            edits.append(".\n")
        elif tag == "replace":
            addr = f"{i1 + 1},{i2}" if i2 - i1 > 1 else f"{i1 + 1}"
            edits.append(f"{addr}c\n")
            for line in b_lines[j1:j2]:
                edits.append(line if line.endswith("\n") else line + "\n")
            edits.append(".\n")
    return edits


async def _diff_pair(
    accessor: RAMAccessor,
    path1: PathSpec | str,
    path2: PathSpec | str,
    i: bool,
    w: bool,
    b: bool,
    e: bool,
    q: bool,
) -> bytes:
    name1 = path1.original if isinstance(path1, PathSpec) else path1
    name2 = path2.original if isinstance(path2, PathSpec) else path2
    data_a = await read_fn(accessor, path1)
    data_b = await read_fn(accessor, path2)
    text_a = data_a.decode(errors="replace")
    text_b = data_b.decode(errors="replace")
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
            return f"Files {name1} and {name2} differ\n".encode()
        return b""
    a_lines = text_a.splitlines(keepends=True)
    b_lines = text_b.splitlines(keepends=True)
    if e:
        result = _ed_script(a_lines, b_lines)
    else:
        result = list(
            difflib.unified_diff(a_lines,
                                 b_lines,
                                 fromfile=name1,
                                 tofile=name2))
    return "".join(result).encode()


@command("diff", resource="ram", spec=SPECS["diff"])
async def diff(
    accessor: RAMAccessor,
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
    if accessor.store is None:
        raise ValueError("diff: no resource")
    paths = await resolve_glob(accessor, paths, index)
    if len(paths) < 2:
        raise ValueError("diff: requires two paths")
    paths[0].prefix
    if r:
        entries_a = sorted(await readdir(
            accessor,
            paths[0],
            index,
        ))
        entries_b = sorted(await readdir(
            accessor,
            paths[1],
            index,
        ))
        names = sorted(set(entries_a) | set(entries_b))
        parts: list[bytes] = []
        for name in names:
            p1_str = paths[0].original.rstrip("/") + "/" + name
            p2_str = paths[1].original.rstrip("/") + "/" + name
            p1 = PathSpec(original=p1_str,
                          directory=p1_str,
                          prefix=paths[0].prefix)
            p2 = PathSpec(original=p2_str,
                          directory=p2_str,
                          prefix=paths[1].prefix)
            if name in entries_a and name in entries_b:
                parts.append(await _diff_pair(
                    accessor,
                    p1,
                    p2,
                    i,
                    w,
                    b,
                    e,
                    q,
                ))
        output = b"".join(parts)
    else:
        output = await _diff_pair(
            accessor,
            paths[0],
            paths[1],
            i,
            w,
            b,
            e,
            q,
        )
    exit_code = 1 if output else 0
    return output, IOResult(exit_code=exit_code,
                            cache=[paths[0].original, paths[1].original])
