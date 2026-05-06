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
from functools import partial

from mirage.accessor.github_ci import GitHubCIAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.grep_helper import (compile_pattern, grep_lines,
                                                 grep_recursive)
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.builtin.utils.wrap import (call_read_bytes, call_readdir,
                                                call_stat)
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.github_ci.glob import resolve_glob
from mirage.core.github_ci.read import read as ci_read
from mirage.core.github_ci.readdir import readdir as _readdir
from mirage.core.github_ci.stat import stat as _stat
from mirage.io.types import ByteSource, IOResult
from mirage.types import FileType, PathSpec


@command("rg", resource="github_ci", spec=SPECS["rg"])
async def rg(
    accessor: GitHubCIAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    i: bool = False,
    v: bool = False,
    n: bool = False,
    c: bool = False,
    args_l: bool = False,
    w: bool = False,
    F: bool = False,
    o: bool = False,
    m: str | None = None,
    A: str | None = None,
    B: str | None = None,
    C: str | None = None,
    hidden: bool = False,
    type: str | None = None,
    glob: str | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if not texts:
        raise ValueError("rg: usage: rg [flags] pattern [path]")
    pattern_str = texts[0]
    max_count = int(m) if m is not None else None
    pat = compile_pattern(pattern_str, i, F, w)

    if paths and index is not None:
        paths = await resolve_glob(accessor, paths, index)
        mount_prefix = paths[0].prefix if paths else ""
        rd = partial(call_readdir,
                     _readdir,
                     accessor,
                     index=index,
                     prefix=mount_prefix)
        st = partial(call_stat,
                     _stat,
                     accessor,
                     index=index,
                     prefix=mount_prefix)
        rb = partial(call_read_bytes,
                     ci_read,
                     accessor,
                     index=index,
                     prefix=mount_prefix)

        all_results: list[str] = []
        warnings_g: list[str] = []
        any_match = False
        for p in paths:
            try:
                s = await st(p.original)
            except FileNotFoundError as exc:
                warnings_g.append(f"rg: {p.original}: {exc}")
                continue
            if s.type == FileType.DIRECTORY:
                res = await grep_recursive(
                    rd,
                    st,
                    rb,
                    p.original,
                    pat,
                    invert=v,
                    line_numbers=n,
                    count_only=c,
                    files_only=args_l,
                    only_matching=o,
                    max_count=max_count,
                    warnings=warnings_g,
                )
                if res:
                    any_match = True
                all_results.extend(res)
                continue
            try:
                data = await rb(p.original)
            except FileNotFoundError:
                warnings_g.append(
                    f"rg: {p.original}: No such file or directory")
                continue
            text_lines = data.decode(errors="replace").splitlines()
            matched = grep_lines(p.original,
                                 text_lines,
                                 pat,
                                 invert=v,
                                 line_numbers=n,
                                 count_only=c,
                                 files_only=args_l,
                                 only_matching=o,
                                 max_count=max_count)
            if not matched:
                continue
            any_match = True
            if args_l:
                all_results.append(p.original)
            elif c:
                all_results.append(f"{p.original}:{len(matched)}")
            else:
                all_results.extend(f"{p.original}:{line}" for line in matched)
        stderr = "\n".join(warnings_g).encode() if warnings_g else None
        if not any_match:
            return b"", IOResult(exit_code=1, stderr=stderr)
        return "\n".join(all_results).encode(), IOResult(stderr=stderr)

    raw = await _read_stdin_async(stdin)
    if raw is None:
        raise ValueError("rg: usage: rg [flags] pattern path")
    text_lines = raw.decode(errors="replace").splitlines()
    matched = grep_lines("<stdin>",
                         text_lines,
                         pat,
                         invert=v,
                         line_numbers=n,
                         count_only=c,
                         files_only=args_l,
                         only_matching=o,
                         max_count=max_count)
    if not matched:
        return b"", IOResult(exit_code=1)
    if c:
        return str(len(matched)).encode(), IOResult()
    return "\n".join(matched).encode(), IOResult()
