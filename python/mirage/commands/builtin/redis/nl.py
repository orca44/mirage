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

import re
from collections.abc import AsyncIterator

from mirage.accessor.redis import RedisAccessor
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.redis.glob import resolve_glob
from mirage.core.redis.stream import stream as _stream_core
from mirage.io.async_line_iterator import AsyncLineIterator
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _should_number(line: str, body_numbering: str,
                   pattern: re.Pattern[str] | None) -> bool:
    if body_numbering == "n":
        return False
    if body_numbering == "a":
        return True
    if body_numbering == "p" and pattern is not None:
        return pattern.search(line) is not None
    return bool(line.strip())


async def _nl_stream(
    source: AsyncIterator[bytes],
    body_numbering: str = "t",
    start: int = 1,
    increment: int = 1,
    width: int = 6,
    separator: str = "\t",
    pattern: re.Pattern[str] | None = None,
) -> AsyncIterator[bytes]:
    num = start
    async for raw_line in AsyncLineIterator(source):
        line = raw_line.decode(errors="replace")
        if _should_number(line, body_numbering, pattern):
            yield f"{num:{width}d}{separator}{line}\n".encode()
            num += increment
        else:
            yield f"{' ' * width}{separator}{line}\n".encode()


async def _nl_multi(
    accessor: RedisAccessor,
    paths: list[PathSpec],
    body_numbering: str,
    start: int,
    increment: int,
    width: int,
    separator: str,
    pattern: re.Pattern[str] | None,
) -> AsyncIterator[bytes]:
    for p in paths:
        source = _stream_core(accessor, p)
        async for chunk in _nl_stream(source, body_numbering, start, increment,
                                      width, separator, pattern):
            yield chunk


@command("nl", resource="redis", spec=SPECS["nl"])
async def nl(
    accessor: RedisAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    b: str | None = None,
    v: str | None = None,
    i: str | None = None,
    w: str | None = None,
    s: str | None = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    body_numbering_raw = b if b is not None else "t"
    pattern: re.Pattern[str] | None = None
    if body_numbering_raw.startswith("p"):
        body_numbering = "p"
        pattern = re.compile(body_numbering_raw[1:])
    else:
        body_numbering = body_numbering_raw
    start = int(v) if v is not None else 1
    increment = int(i) if i is not None else 1
    width = int(w) if w is not None else 6
    separator = s if s is not None else "\t"
    if paths and accessor.store is not None:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        return _nl_multi(accessor, paths, body_numbering, start, increment,
                         width, separator, pattern), IOResult()
    source = _resolve_source(stdin, "nl: missing operand")
    return _nl_stream(source, body_numbering, start, increment, width,
                      separator, pattern), IOResult()
