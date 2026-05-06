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

from mirage.accessor.github import GitHubAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.github._provision import metadata_provision
from mirage.commands.builtin.utils.formatting import _human_size
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.github.glob import resolve_glob
from mirage.io.types import ByteSource, IOResult
from mirage.provision.types import ProvisionResult
from mirage.types import PathSpec


def _format_size(size: int, human: bool) -> str:
    return _human_size(size) if human else str(size)


async def du_provision(
    accessor: GitHubAccessor,
    paths: list[PathSpec],
    *texts: str,
    index: IndexCacheStore = None,
    **_extra: object,
) -> ProvisionResult:
    return await metadata_provision("du " + " ".join(
        p.original if isinstance(p, PathSpec) else p for p in paths))


@command("du", resource="github", spec=SPECS["du"], provision=du_provision)
async def du(
    accessor: GitHubAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    h: bool = False,
    s: bool = False,
    a: bool = False,
    max_depth: str | None = None,
    c: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if index is None:
        raise ValueError("du: no tree loaded")
    paths = await resolve_glob(accessor, paths, index)
    p = paths[0]
    path = p.original
    key = path
    du_prefix = key + "/" if key else ""
    total = 0
    for ep, entry in index._entries.items():
        if ep == key or ep.startswith(du_prefix):
            if entry.size is not None:
                total += entry.size
    if s:
        output = _format_size(total, h) + "\t" + path
        if c:
            output += "\n" + _format_size(total, h) + "\ttotal"
        return output.encode(), IOResult()
    lines: list[str] = []
    lines.append(_format_size(total, h) + "\t" + path)
    if c:
        lines.append(_format_size(total, h) + "\ttotal")
    return "\n".join(lines).encode(), IOResult()
