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

from mirage.accessor.ram import RAMAccessor
from mirage.commands.builtin.utils.stream import _resolve_source
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ram.glob import resolve_glob
from mirage.core.ram.stat import stat as _stat_async
from mirage.core.ram.stream import stream as _stream_core
from mirage.io.async_line_iterator import AsyncLineIterator
from mirage.io.types import ByteSource, IOResult
from mirage.provision import Precision, ProvisionResult
from mirage.types import PathSpec


async def _head_stream(
    source: AsyncIterator[bytes],
    lines: int = 10,
    bytes_mode: int | None = None,
) -> AsyncIterator[bytes]:
    if bytes_mode is not None:
        remaining = bytes_mode
        async for chunk in source:
            if len(chunk) <= remaining:
                yield chunk
                remaining -= len(chunk)
                if remaining <= 0:
                    return
            else:
                yield chunk[:remaining]
                return
        return
    count = 0
    async for line in AsyncLineIterator(source):
        yield line + b"\n"
        count += 1
        if count >= lines:
            return


async def head_provision(
    accessor: RAMAccessor = None,
    paths: list[PathSpec] | None = None,
    *texts: str,
    n: str | None = None,
    c: str | None = None,
    **_extra: object,
) -> ProvisionResult:
    if not paths or accessor.store is None:
        return ProvisionResult(command="head")
    paths = await resolve_glob(accessor, paths, _extra.get("index"))
    s = await _stat_async(accessor, paths[0])
    file_size = s.size
    lines = int(n) if n is not None else 10
    avg_line = 80
    low = min(lines * avg_line, file_size)
    return ProvisionResult(
        command=f"head {paths[0].original}",
        network_read_low=low,
        network_read_high=file_size,
        read_ops=1,
        precision=Precision.RANGE,
    )


@command("head", resource="ram", spec=SPECS["head"], provision=head_provision)
async def head(
    accessor: RAMAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    n: str | None = None,
    c: str | None = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    lines = int(n) if n is not None else 10
    bytes_mode = int(c) if c is not None else None
    if paths and accessor.store is not None:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        source = _stream_core(accessor, paths[0])
        return _head_stream(source, lines, bytes_mode), IOResult()
    source = _resolve_source(stdin, "head: missing operand")
    return _head_stream(source, lines, bytes_mode), IOResult()
