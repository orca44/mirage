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
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ssh.glob import resolve_glob
from mirage.core.ssh.stream import read_stream
from mirage.io.async_line_iterator import AsyncLineIterator
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _comparison_key(
    line: bytes,
    skip_fields: int,
    skip_chars: int,
    check_chars: int,
    ignore_case: bool,
) -> bytes:
    text = line
    if skip_fields > 0:
        decoded = text.decode(errors="replace")
        parts = decoded.split()
        remaining = parts[skip_fields:] if skip_fields < len(parts) else []
        text = " ".join(remaining).encode()
    if skip_chars > 0:
        text = text[skip_chars:]
    if check_chars > 0:
        text = text[:check_chars]
    if ignore_case:
        text = text.lower()
    return text


async def _uniq_stream(
    source: AsyncIterator[bytes],
    count: bool = False,
    duplicates_only: bool = False,
    unique_only: bool = False,
    skip_fields: int = 0,
    skip_chars: int = 0,
    ignore_case: bool = False,
    check_chars: int = 0,
) -> AsyncIterator[bytes]:
    prev_line: bytes | None = None
    prev_key: bytes | None = None
    prev_count = 0
    async for raw_line in AsyncLineIterator(source):
        key = _comparison_key(raw_line, skip_fields, skip_chars, check_chars,
                              ignore_case)
        if key == prev_key:
            prev_count += 1
        else:
            if prev_line is not None:
                if not (duplicates_only and prev_count == 1):
                    if not (unique_only and prev_count > 1):
                        if count:
                            yield f"{prev_count:>7} ".encode(
                            ) + prev_line + b"\n"
                        else:
                            yield prev_line + b"\n"
            prev_line = raw_line
            prev_key = key
            prev_count = 1
    if prev_line is not None:
        if not (duplicates_only and prev_count == 1):
            if not (unique_only and prev_count > 1):
                if count:
                    yield f"{prev_count:>7} ".encode() + prev_line + b"\n"
                else:
                    yield prev_line + b"\n"


@command("uniq", resource="ssh", spec=SPECS["uniq"])
async def uniq(
    accessor: SSHAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    c: bool = False,
    d: bool = False,
    u: bool = False,
    f: str | None = None,
    s: str | None = None,
    i: bool = False,
    w: str | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    skip_fields = int(f) if f else 0
    skip_chars = int(s) if s else 0
    check_chars = int(w) if w else 0
    if paths:
        paths = await resolve_glob(accessor, paths, index)
        source = read_stream(accessor, paths[0])
        return _uniq_stream(
            source,
            count=c,
            duplicates_only=d,
            unique_only=u,
            skip_fields=skip_fields,
            skip_chars=skip_chars,
            ignore_case=i,
            check_chars=check_chars,
        ), IOResult(cache=[paths[0].strip_prefix])
    source = _resolve_source(stdin, "uniq: missing operand")
    return _uniq_stream(
        source,
        count=c,
        duplicates_only=d,
        unique_only=u,
        skip_fields=skip_fields,
        skip_chars=skip_chars,
        ignore_case=i,
        check_chars=check_chars,
    ), IOResult()
