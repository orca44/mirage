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


async def _collect_lines(source: AsyncIterator[bytes]) -> list[bytes]:
    lines: list[bytes] = []
    async for line in AsyncLineIterator(source):
        lines.append(line)
    return lines


@command("tac", resource="ssh", spec=SPECS["tac"])
async def tac(
    accessor: SSHAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    cache: list[str] = []
    if paths:
        paths = await resolve_glob(accessor, paths, index)
        source: AsyncIterator[bytes] = read_stream(accessor, paths[0])
        cache = [paths[0].original]
    else:
        source = _resolve_source(stdin, "tac: missing input")

    lines = await _collect_lines(source)
    lines.reverse()
    return b"\n".join(lines) + b"\n", IOResult(cache=cache)
