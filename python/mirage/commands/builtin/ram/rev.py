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

from mirage.accessor.ram import RAMAccessor
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ram.glob import resolve_glob
from mirage.core.ram.read import read_bytes as _read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("rev", resource="ram", spec=SPECS["rev"])
async def rev(
    accessor: RAMAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if paths and accessor.store is not None:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        all_lines: list[str] = []
        for p in paths:
            data = (await _read_bytes(accessor, p)).decode(errors="replace")
            all_lines.extend(data.splitlines())
        reversed_lines = [line[::-1] for line in all_lines]
        return ("\n".join(reversed_lines) + "\n").encode(), IOResult()
    raw = await _read_stdin_async(stdin)
    if raw is None:
        raise ValueError("rev: missing operand")
    lines = raw.decode(errors="replace").splitlines()
    reversed_lines = [line[::-1] for line in lines]
    return ("\n".join(reversed_lines) + "\n").encode(), IOResult()
