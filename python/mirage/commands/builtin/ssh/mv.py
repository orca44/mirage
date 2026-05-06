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

from mirage.accessor.ssh import SSHAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ssh.glob import resolve_glob
from mirage.core.ssh.rename import rename
from mirage.core.ssh.stat import stat as stat_impl
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


async def _exists(accessor: SSHAccessor, path: PathSpec | str) -> bool:
    try:
        await stat_impl(accessor, path)
        return True
    except (FileNotFoundError, ValueError, Exception):
        return False


@command("mv", resource="ssh", spec=SPECS["mv"], write=True)
async def mv(
    accessor: SSHAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    f: bool = False,
    n: bool = False,
    v: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if len(paths) < 2:
        raise ValueError("mv: requires src and dst")
    paths = await resolve_glob(accessor, paths, index)
    if n and await _exists(accessor, paths[1]):
        return None, IOResult()
    await rename(accessor, paths[0], paths[1])
    output = None
    if v:
        output = f"'{paths[0].original}' -> '{paths[1].original}'\n".encode()
    writes = {
        paths[0].strip_prefix: b"",
        paths[1].strip_prefix: b"",
    }
    return output, IOResult(writes=writes)
