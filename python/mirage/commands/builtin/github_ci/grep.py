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
from mirage.commands.builtin.grep_helper import (compile_pattern,
                                                 grep_files_only, grep_lines,
                                                 grep_recursive, grep_stream)
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.builtin.utils.wrap import (call_read_bytes, call_readdir,
                                                call_stat)
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.github_ci.glob import resolve_glob
from mirage.core.github_ci.read import read as ci_read
from mirage.core.github_ci.readdir import readdir as _readdir
from mirage.core.github_ci.stat import stat as _stat
from mirage.io.stream import exit_on_empty, quiet_match
from mirage.io.types import ByteSource, IOResult
from mirage.types import FileType, PathSpec


@command("grep", resource="github_ci", spec=SPECS["grep"])
async def grep(
    accessor: GitHubCIAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    r: bool = False,
    R: bool = False,
    i: bool = False,
    v: bool = False,
    n: bool = False,
    c: bool = False,
    args_l: bool = False,
    w: bool = False,
    F: bool = False,
    E: bool = False,
    o: bool = False,
    m: str | None = None,
    q: bool = False,
    H: bool = False,
    args_h: bool = False,
    A: str | None = None,
    B: str | None = None,
    C: str | None = None,
    e: str | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if e is not None:
        pattern = e
    elif texts:
        pattern = texts[0]
    else:
        raise ValueError("grep: usage: grep [flags] pattern [path]")
    max_count = int(m) if m is not None else None
    after_ctx = int(A) if A is not None else (int(C) if C is not None else 0)
    before_ctx = int(B) if B is not None else (int(C) if C is not None else 0)

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

        recursive = r or R
        multi = len(paths) > 1 or recursive

        if args_l:
            warnings_l: list[str] = []
            results = await grep_files_only(
                rd,
                st,
                rb,
                paths[0].original,
                pattern,
                recursive=recursive,
                ignore_case=i,
                invert=v,
                line_numbers=n,
                count_only=c,
                fixed_string=F,
                only_matching=o,
                max_count=max_count,
                whole_word=w,
                warnings=warnings_l,
            )
            stderr = "\n".join(warnings_l).encode() if warnings_l else None
            if not results:
                return b"", IOResult(exit_code=1, stderr=stderr)
            return "\n".join(results).encode(), IOResult(stderr=stderr)

        pat = compile_pattern(pattern, i, F, w)
        all_results: list[str] = []
        warnings_g: list[str] = []
        for p in paths:
            try:
                s = await st(p.original)
            except FileNotFoundError as exc:
                warnings_g.append(f"grep: {p.original}: {exc}")
                continue
            if s.type == FileType.DIRECTORY:
                if recursive:
                    res = await grep_recursive(
                        rd,
                        st,
                        rb,
                        p.original,
                        pat,
                        invert=v,
                        line_numbers=n,
                        count_only=c,
                        files_only=False,
                        only_matching=o,
                        max_count=max_count,
                        warnings=warnings_g,
                    )
                    all_results.extend(res)
                else:
                    warnings_g.append(f"grep: {p.original}: Is a directory")
                continue
            try:
                data = await rb(p.original)
            except FileNotFoundError:
                warnings_g.append(
                    f"grep: {p.original}: No such file or directory")
                continue
            text_lines = data.decode(errors="replace").splitlines()
            file_lines = grep_lines(p.original,
                                    text_lines,
                                    pat,
                                    invert=v,
                                    line_numbers=n,
                                    count_only=c,
                                    files_only=False,
                                    only_matching=o,
                                    max_count=max_count)
            if multi:
                if c and file_lines:
                    all_results.append(f"{p.original}:{file_lines[0]}")
                else:
                    all_results.extend(f"{p.original}:{line}"
                                       for line in file_lines)
            else:
                all_results.extend(file_lines)
        stderr = "\n".join(warnings_g).encode() if warnings_g else None
        if not all_results:
            return b"", IOResult(exit_code=1, stderr=stderr)
        return "\n".join(all_results).encode(), IOResult(stderr=stderr)

    source = _resolve_source(stdin, "grep: usage: grep [flags] pattern [path]")
    pat = compile_pattern(pattern, i, F, w)
    stream = grep_stream(
        source,
        pat,
        invert=v,
        line_numbers=n,
        only_matching=o,
        max_count=max_count,
        count_only=c,
        after_context=after_ctx,
        before_context=before_ctx,
    )
    if q:
        io = IOResult(exit_code=1)
        return quiet_match(stream, io), io
    io = IOResult()
    return exit_on_empty(stream, io), io
