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

from collections import deque
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


def _topological_sort(pairs: list[tuple[str, str]]) -> tuple[list[str], bool]:
    graph: dict[str, set[str]] = {}
    in_degree: dict[str, int] = {}
    for a, b in pairs:
        if a not in graph:
            graph[a] = set()
            in_degree.setdefault(a, 0)
        if b not in graph:
            graph[b] = set()
            in_degree.setdefault(b, 0)
        if b not in graph[a]:
            graph[a].add(b)
            in_degree[b] = in_degree.get(b, 0) + 1
    queue: deque[str] = deque()
    for node in in_degree:
        if in_degree[node] == 0:
            queue.append(node)
    result: list[str] = []
    while queue:
        node = queue.popleft()
        result.append(node)
        for neighbor in sorted(graph[node]):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    has_cycle = len(result) != len(graph)
    return result, has_cycle


@command("tsort", resource="disk", spec=SPECS["tsort"])
async def tsort(
    accessor: DiskAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if paths and accessor.root is not None:
        paths = await resolve_glob(accessor, paths, index)
        raw = await read_bytes(accessor, paths[0])
    else:
        raw = await _read_stdin_async(stdin)
        if raw is None:
            raise ValueError("tsort: missing input")
    text = raw.decode(errors="replace")
    tokens = text.split()
    if len(tokens) % 2 != 0:
        return b"tsort: odd number of tokens\n", IOResult(exit_code=1)
    pairs: list[tuple[str, str]] = []
    for idx in range(0, len(tokens), 2):
        pairs.append((tokens[idx], tokens[idx + 1]))
    result, has_cycle = _topological_sort(pairs)
    if has_cycle:
        return b"tsort: cycle detected\n", IOResult(exit_code=1)
    output = "\n".join(result) + "\n"
    return output.encode(), IOResult()
