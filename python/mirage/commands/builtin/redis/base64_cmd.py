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

import base64 as b64lib
from collections.abc import AsyncIterator

from mirage.accessor.redis import RedisAccessor
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.redis.glob import resolve_glob
from mirage.core.redis.stream import stream as _stream_core
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec

_ENCODE_BLOCK = 57


async def _base64_encode_stream(
    source: AsyncIterator[bytes],
    wrap: int | None = None,
) -> AsyncIterator[bytes]:
    buf = b""
    async for chunk in source:
        buf += chunk
    encoded = b64lib.b64encode(buf).decode()
    if wrap is not None and wrap == 0:
        yield encoded.encode() + b"\n"
        return
    line_len = wrap if wrap is not None else 76
    lines: list[str] = []
    for i in range(0, len(encoded), line_len):
        lines.append(encoded[i:i + line_len])
    yield "\n".join(lines).encode() + b"\n"


async def _base64_decode_stream(
        source: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
    buf = b""
    async for chunk in source:
        buf += chunk
    text = buf.replace(b"\n", b"").replace(b"\r", b"").replace(b" ", b"")
    yield b64lib.b64decode(text)


@command("base64", resource="redis", spec=SPECS["base64"])
async def base64_cmd(
    accessor: RedisAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    d: bool = False,
    D: bool = False,
    w: str | None = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    decode = d or D
    cache: list[str] = []
    if paths and accessor.store is not None:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        source: AsyncIterator[bytes] = _stream_core(accessor, paths[0])
        cache = [paths[0].original]
    else:
        source = _resolve_source(stdin, "base64: missing input")
    if decode:
        return _base64_decode_stream(source), IOResult(cache=cache)
    wrap = int(w) if w is not None else None
    return _base64_encode_stream(source, wrap=wrap), IOResult(cache=cache)
