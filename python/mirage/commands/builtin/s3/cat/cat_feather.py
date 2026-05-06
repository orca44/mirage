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
from mirage.core.filetype.feather import cat as feather_cat
from mirage.core.s3.glob import resolve_glob
from mirage.core.s3.read import read_bytes
from mirage.core.s3.stat import stat
from mirage.io.types import ByteSource, IOResult
from mirage.provision import ProvisionResult
from mirage.types import PathSpec


async def cat_feather_provision(
    accessor: S3Accessor = None,
    paths: list[PathSpec] | None = None,
    *texts: str,
    index: IndexCacheStore = None,
    **_extra: object,
) -> ProvisionResult:
    if not paths or accessor is None:
        return ProvisionResult(command="cat")
    paths = await resolve_glob(accessor, paths, index)
    s = await stat(accessor, paths[0], index)
    return ProvisionResult(
        command=f"cat {paths[0].original}",
        network_read_low=s.size,
        network_read_high=s.size,
        read_ops=1,
    )


@command("cat",
         resource="s3",
         spec=SPECS["cat"],
         filetype=".arrow",
         provision=cat_feather_provision)
@command("cat",
         resource="s3",
         spec=SPECS["cat"],
         filetype=".ipc",
         provision=cat_feather_provision)
@command("cat",
         resource="s3",
         spec=SPECS["cat"],
         filetype=".feather",
         provision=cat_feather_provision)
async def cat_feather(
    accessor: S3Accessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    n: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if not paths:
        raise ValueError("cat: missing operand")
    paths = await resolve_glob(accessor, paths, index)
    try:
        raw = await read_bytes(accessor, paths[0])
        result = feather_cat(raw)
        return result, IOResult(reads={paths[0].strip_prefix: raw},
                                cache=[paths[0].strip_prefix])
    except Exception as e:
        return None, IOResult(
            exit_code=1,
            stderr=f"cat: {paths[0].original}: failed to read as feather: {e}".
            encode(),
        )
