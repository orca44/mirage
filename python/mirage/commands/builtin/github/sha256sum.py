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

import hashlib
from collections.abc import AsyncIterator

from mirage.accessor.github import GitHubAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.github.glob import resolve_glob
from mirage.core.github.read import read as github_read
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("sha256sum", resource="github", spec=SPECS["sha256sum"])
async def sha256sum(
    accessor: GitHubAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    c: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if paths and index is not None:
        paths = await resolve_glob(accessor, paths, index)
        lines: list[str] = []
        for p in paths:
            data = await github_read(accessor, p, index)
            h = hashlib.sha256(data).hexdigest()
            lines.append(h + "  " + p.original)
        return ("\n".join(lines) + "\n").encode(), IOResult()
    if stdin is not None:
        if isinstance(stdin, bytes):
            raw = stdin
        else:
            raw = b""
            async for chunk in stdin:
                raw += chunk
        h = hashlib.sha256(raw).hexdigest()
        return (h + "  -\n").encode(), IOResult()
    raise ValueError("sha256sum: missing input")
