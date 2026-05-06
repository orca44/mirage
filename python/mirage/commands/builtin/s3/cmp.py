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
from mirage.core.s3.glob import resolve_glob
from mirage.core.s3.read import read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("cmp", resource="s3", spec=SPECS["cmp"])
async def cmp_cmd(
    accessor: S3Accessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    s: bool = False,
    args_l: bool = False,
    n: str | None = None,
    b: bool = False,
    i: str | None = None,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if len(paths) < 2:
        raise ValueError("cmp: requires two paths")
    paths = await resolve_glob(accessor, paths, index)
    p0 = paths[0]
    p1 = paths[1]
    data1 = await read_bytes(accessor, p0)
    data2 = await read_bytes(accessor, p1)
    if i is not None:
        skip = int(i)
        data1 = data1[skip:]
        data2 = data2[skip:]
    if n is not None:
        limit = int(n)
        data1 = data1[:limit]
        data2 = data2[:limit]
    if data1 == data2:
        return None, IOResult()
    if s:
        return None, IOResult(exit_code=1)
    if args_l:
        out_lines: list[str] = []
        for idx in range(min(len(data1), len(data2))):
            if data1[idx] != data2[idx]:
                out_lines.append(
                    f"{idx + 1} {oct(data1[idx])} {oct(data2[idx])}")
        return "\n".join(out_lines).encode(), IOResult(exit_code=1)
    for idx in range(min(len(data1), len(data2))):
        if data1[idx] != data2[idx]:
            line = 1 + data1[:idx].count(ord(b"\n"))
            msg = (f"{p0.original} {p1.original}"
                   f" differ: byte {idx + 1}, line {line}")
            if b:
                msg += (f" is {oct(data1[idx])} {chr(data1[idx])}"
                        f" {oct(data2[idx])} {chr(data2[idx])}")
            return msg.encode(), IOResult(exit_code=1)
    shorter = p0.original if len(data1) < len(data2) else p1.original
    msg = f"cmp: EOF on {shorter}"
    return msg.encode(), IOResult(exit_code=1)
