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

import gzip
import re
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


def _build_pattern(
    pattern: str,
    extended: bool,
    fixed: bool,
    whole_word: bool,
) -> str:
    if fixed:
        pattern = re.escape(pattern)
    if whole_word:
        pattern = r"\b" + pattern + r"\b"
    return pattern


def _zgrep_search(
    data: bytes,
    pattern: str,
    ignore_case: bool,
    invert: bool,
    count: bool,
    line_numbers: bool,
    filename: str | None,
    only_matching: bool = False,
    max_count: int | None = None,
) -> tuple[list[str], bool]:
    text = data.decode(errors="replace")
    lines = text.splitlines()
    flags = re.IGNORECASE if ignore_case else 0
    matched: list[tuple[int, str]] = []
    for idx, line in enumerate(lines, 1):
        if only_matching and not invert:
            hits = list(re.finditer(pattern, line, flags))
            if hits:
                for m in hits:
                    matched.append((idx, m.group()))
                    if max_count is not None and len(matched) >= max_count:
                        break
            elif invert:
                matched.append((idx, line))
        else:
            hit = bool(re.search(pattern, line, flags))
            if invert:
                hit = not hit
            if hit:
                matched.append((idx, line))
        if max_count is not None and len(matched) >= max_count:
            break
    if count:
        return [str(len(matched))], len(matched) > 0
    result: list[str] = []
    for idx, line in matched:
        prefix = ""
        if filename:
            prefix = filename + ":"
        if line_numbers:
            prefix += str(idx) + ":"
        result.append(prefix + line)
    return result, len(matched) > 0


@command("zgrep", resource="disk", spec=SPECS["zgrep"])
async def zgrep(
    accessor: DiskAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    i: bool = False,
    c: bool = False,
    args_l: bool = False,
    n: bool = False,
    v: bool = False,
    e: str | None = None,
    E: bool = False,
    F: bool = False,
    H: bool = False,
    h: bool = False,
    m: str | None = None,
    o: bool = False,
    q: bool = False,
    w: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    raw_pattern = e if e is not None else (texts[0] if texts else "")
    pattern = _build_pattern(raw_pattern, E, F, w)
    max_count = int(m) if m is not None else None
    multi = len(paths) > 1
    show_filename = H or (multi and not h)
    any_match = False
    all_results: list[str] = []
    if paths and accessor.root is not None:
        paths = await resolve_glob(accessor, paths, index)
        for p in paths:
            raw = await read_bytes(accessor, p)
            data = gzip.decompress(raw)
            fname = p.original if show_filename else None
            if args_l:
                text = data.decode(errors="replace")
                lines = text.splitlines()
                flags = re.IGNORECASE if i else 0
                for line in lines:
                    hit = bool(re.search(pattern, line, flags))
                    if v:
                        hit = not hit
                    if hit:
                        all_results.append(p.original)
                        any_match = True
                        break
            else:
                result, had_match = _zgrep_search(data, pattern, i, v, c, n,
                                                  fname, o, max_count)
                if had_match:
                    any_match = True
                all_results.extend(result)
    else:
        raw = await _read_stdin_async(stdin)
        if raw is None:
            raise ValueError("zgrep: missing input")
        data = gzip.decompress(raw)
        if args_l:
            text = data.decode(errors="replace")
            lines = text.splitlines()
            flags = re.IGNORECASE if i else 0
            for line in lines:
                hit = bool(re.search(pattern, line, flags))
                if v:
                    hit = not hit
                if hit:
                    all_results.append("(standard input)")
                    any_match = True
                    break
        else:
            result, had_match = _zgrep_search(data, pattern, i, v, c, n, None,
                                              o, max_count)
            if had_match:
                any_match = True
            all_results.extend(result)
    if q:
        return None, IOResult(exit_code=0 if any_match else 1)
    if not any_match:
        return None, IOResult(exit_code=1)
    output = "\n".join(all_results) + "\n"
    return output.encode(), IOResult()
