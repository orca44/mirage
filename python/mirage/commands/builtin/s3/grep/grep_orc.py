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

from mirage.accessor.s3 import S3Accessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.filetype.orc import grep as orc_grep
from mirage.core.s3.glob import resolve_glob
from mirage.core.s3.read import read_bytes
from mirage.core.s3.stat import stat
from mirage.io.types import ByteSource, IOResult
from mirage.provision import ProvisionResult
from mirage.types import PathSpec


async def grep_orc_provision(
    accessor: S3Accessor = None,
    paths: list[PathSpec] | None = None,
    *texts: str,
    index: IndexCacheStore = None,
    **_extra: object,
) -> ProvisionResult:
    if not paths or accessor is None:
        return ProvisionResult(command="grep")
    paths = await resolve_glob(accessor, paths, index)
    s = await stat(accessor, paths[0])
    return ProvisionResult(
        command=f"grep {paths[0].original}",
        network_read_low=s.size,
        network_read_high=s.size,
        read_ops=1,
    )


@command("grep",
         resource="s3",
         spec=SPECS["grep"],
         filetype=".orc",
         provision=grep_orc_provision)
async def grep_orc(
    accessor: S3Accessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    r: bool = False,
    R: bool = False,
    i: bool = False,
    v: bool = False,
    n: bool = False,
    c: bool = False,
    args_l: bool = False,
    w: bool = False,
    F: bool = False,
    E: bool = False,
    o: bool = False,
    m: str | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if not paths or not texts:
        raise ValueError("grep: missing operand")
    paths = await resolve_glob(accessor, paths, index)
    try:
        pattern = texts[0]
        raw = await read_bytes(accessor, paths[0])
        result = orc_grep(raw, pattern, ignore_case=i)
        if c:
            count = len(result.decode().strip().splitlines()) - 1
            return str(max(0, count)).encode(), IOResult(
                reads={paths[0].strip_prefix: raw},
                cache=[paths[0].strip_prefix])
        return result, IOResult(reads={paths[0].strip_prefix: raw},
                                cache=[paths[0].strip_prefix])
    except Exception as e:
        return None, IOResult(
            exit_code=1,
            stderr=f"grep: {paths[0].original}: failed to read as orc: {e}".
            encode(),
        )
