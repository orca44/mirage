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

import re
from collections.abc import AsyncIterator

from mirage.accessor.disk import DiskAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.sed_helper import (_execute_program,
                                                _parse_one_command,
                                                _parse_program)
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.disk.glob import resolve_glob
from mirage.core.disk.read import read_bytes
from mirage.core.disk.stream import read_stream
from mirage.core.disk.write import write_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("sed", resource="disk", spec=SPECS["sed"])
async def sed(
    accessor: DiskAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    i: bool = False,
    e: bool = False,
    n: bool = False,
    E: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if not texts:
        raise ValueError("sed: usage: sed EXPRESSION [path]")

    if ";" in texts[0] or "{" in texts[0]:
        commands = _parse_program(texts[0])
    else:
        commands = [_parse_one_command(texts[0])[0]]

    is_simple_sub = (len(commands) == 1 and commands[0]["cmd"] == "s"
                     and commands[0].get("addr_start") is None and not n)

    if paths:
        paths = await resolve_glob(accessor, paths, index)
    if is_simple_sub and paths and accessor.root is not None:
        parsed = commands[0]
        re_flags = re.IGNORECASE if "i" in parsed["expr_flags"] else 0
        count = 0 if "g" in parsed["expr_flags"] else 1
        if i:
            data = (await read_bytes(accessor,
                                     paths[0])).decode(errors="replace")
            new_data = re.sub(parsed["pattern"],
                              parsed["replacement"],
                              data,
                              flags=re_flags,
                              count=count)
            await write_bytes(accessor, paths[0], new_data.encode())
            return None, IOResult(writes={paths[0].original: b""})
        else:
            outputs: list[str] = []
            for p in paths:
                data = (await read_bytes(accessor, p)).decode(errors="replace")
                new_data = re.sub(parsed["pattern"],
                                  parsed["replacement"],
                                  data,
                                  flags=re_flags,
                                  count=count)
                outputs.append(new_data)
            return "".join(outputs).encode(), IOResult(
                cache=[p.original for p in paths])

    if paths and accessor.root is not None:
        data_b = b""
        async for chunk in read_stream(accessor, paths[0]):
            data_b += chunk
        text = data_b.decode(errors="replace")
        result = _execute_program(text, commands, suppress=n)
        modifying = i and any(c["cmd"] in ("s", "d") for c in commands)
        if modifying:
            new_bytes = result.encode()
            await write_bytes(accessor, paths[0], new_bytes)
            return None, IOResult(writes={paths[0].original: new_bytes},
                                  cache=[paths[0].strip_prefix])
        return result.encode(), IOResult()

    raw = await _read_stdin_async(stdin)
    if raw is None:
        raise ValueError("sed: usage: sed EXPRESSION path")
    text = raw.decode(errors="replace")
    result = _execute_program(text, commands, suppress=n)
    return result.encode(), IOResult()
