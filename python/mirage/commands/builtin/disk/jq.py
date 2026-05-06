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

from mirage.accessor.disk import DiskAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.disk.glob import resolve_glob
from mirage.core.disk.read import read_bytes
from mirage.core.disk.stat import stat as _stat_async
from mirage.core.disk.stream import read_stream as _stream
from mirage.core.jq import (eval_jsonl_stream, format_jq_output, is_jsonl_path,
                            is_streamable_jsonl_expr, jq_eval, parse_json_auto,
                            parse_json_path)
from mirage.io.types import ByteSource, IOResult
from mirage.provision import Precision, ProvisionResult
from mirage.types import PathSpec


async def jq_provision(
    accessor: DiskAccessor,
    paths: list[PathSpec] | None = None,
    *texts: str,
    index: IndexCacheStore = None,
    **_extra: object,
) -> ProvisionResult:
    if not paths or accessor.root is None or not texts:
        return ProvisionResult(command="jq")
    p = paths[0]
    s = await _stat_async(accessor, p)
    file_size = s.size or 0
    expr = texts[0]
    if is_jsonl_path(p.original) and is_streamable_jsonl_expr(expr):
        return ProvisionResult(
            command=f"jq {expr!r} {p.original}",
            network_read_low=0,
            network_read_high=file_size,
            read_ops=1,
            precision=Precision.RANGE,
        )
    return ProvisionResult(
        command=f"jq {expr!r} {p.original}",
        network_read_low=file_size,
        network_read_high=file_size,
        read_ops=1,
        precision=Precision.EXACT,
    )


@command("jq", resource="disk", spec=SPECS["jq"], provision=jq_provision)
async def jq(
    accessor: DiskAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    r: bool = False,
    c: bool = False,
    s: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if not texts:
        raise ValueError("jq: usage: jq EXPRESSION [path]")
    expression = texts[0]
    if paths and accessor.root is not None:
        paths = await resolve_glob(accessor, paths, index)
        if is_jsonl_path(
                paths[0].original) and is_streamable_jsonl_expr(expression):
            source = _stream(accessor, paths[0])
            return eval_jsonl_stream(source, expression), IOResult()
        outputs: list[bytes] = []
        for p in paths:
            data = parse_json_path(await read_bytes(accessor, p), p.original)
            if s:
                data = [data] if not isinstance(data, list) else data
            result = jq_eval(data, expression.strip())
            spread = "[]" in expression
            outputs.append(format_jq_output(result, r, c, spread))
        return b"".join(outputs), IOResult()
    if stdin is not None:
        if isinstance(stdin, bytes):
            raw_bytes = stdin
        else:
            raw_bytes = b""
            async for chunk in stdin:
                raw_bytes += chunk
        if s:
            data = parse_json_auto(raw_bytes)
            if not isinstance(data, list):
                data = [data]
        else:
            data = parse_json_auto(raw_bytes)
        result = jq_eval(data, expression.strip())
        spread = "[]" in expression
        return format_jq_output(result, r, c, spread), IOResult()
