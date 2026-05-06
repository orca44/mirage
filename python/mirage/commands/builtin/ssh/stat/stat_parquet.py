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
from mirage.core.filetype.parquet import stat as parquet_stat
from mirage.core.ssh.glob import resolve_glob
from mirage.core.ssh.read import read_bytes
from mirage.core.ssh.stat import stat
from mirage.io.types import ByteSource, IOResult
from mirage.provision import Precision, ProvisionResult
from mirage.types import PathSpec


async def stat_parquet_provision(
    accessor: SSHAccessor = None,
    paths: list[PathSpec] | None = None,
    *texts: str,
    index: IndexCacheStore = None,
    **_extra: object,
) -> ProvisionResult:
    if not paths or accessor is None:
        return ProvisionResult(command="stat")
    paths = await resolve_glob(accessor, paths, index)
    s = await stat(accessor, paths[0])
    footer_size = min(s.size, 8192)
    return ProvisionResult(
        command=f"stat {paths[0].original}",
        network_read_low=footer_size,
        network_read_high=s.size,
        read_ops=1,
        precision=Precision.RANGE,
    )


@command("stat",
         resource="ssh",
         spec=SPECS["stat"],
         filetype=".parquet",
         provision=stat_parquet_provision)
async def stat_parquet(
    accessor: SSHAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if not paths:
        raise ValueError("stat: missing operand")
    paths = await resolve_glob(accessor, paths, index)
    try:
        raw = await read_bytes(accessor, paths[0])
        result = parquet_stat(raw)
        return result, IOResult(reads={paths[0].strip_prefix: raw},
                                cache=[paths[0].strip_prefix])
    except Exception as e:
        return None, IOResult(
            exit_code=1,
            stderr=f"stat: {paths[0].original}: failed to read as parquet: {e}"
            .encode(),
        )
