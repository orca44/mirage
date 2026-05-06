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

from mirage.accessor.ssh import SSHAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ssh.glob import resolve_glob
from mirage.core.ssh.read import read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("md5", resource="ssh", spec=SPECS["md5"])
async def md5(
    accessor: SSHAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if not paths:
        raise ValueError("md5: missing operand")
    paths = await resolve_glob(accessor, paths, index)
    data = await read_bytes(accessor, paths[0])
    result = hashlib.md5(data).hexdigest()
    return result.encode(), IOResult()
