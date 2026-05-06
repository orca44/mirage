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

import random
from collections.abc import AsyncIterator

from mirage.accessor.gdrive import GDriveAccessor
from mirage.commands.builtin.gdrive._provision import file_read_provision
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.gdrive.glob import resolve_glob
from mirage.core.gdrive.read import read as gdrive_read
from mirage.io.types import ByteSource, IOResult
from mirage.provision.types import ProvisionResult
from mirage.types import PathSpec


async def shuf_provision(
    accessor: GDriveAccessor,
    paths: list[PathSpec],
    *texts: str,
    **_extra: object,
) -> ProvisionResult:
    return await file_read_provision(
        accessor,
        paths,
        "shuf " + " ".join(p.original if isinstance(p, PathSpec) else p
                           for p in paths),
        index=_extra.get("index"))


@command("shuf",
         resource="gdrive",
         spec=SPECS["shuf"],
         provision=shuf_provision)
async def shuf(
    accessor: GDriveAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    n: str | None = None,
    e: bool = False,
    z: bool = False,
    r: bool = False,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    sep = "\x00" if z else "\n"
    if e:
        items = list(paths) if paths else list(texts)
        if r:
            count = int(n) if n is not None else len(items)
            items = random.choices(items, k=count)
        else:
            random.shuffle(items)
            if n is not None:
                items = items[:int(n)]
        return (sep.join(str(i) for i in items) + sep).encode(), IOResult()
    if paths:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        all_lines: list[str] = []
        for p in paths:
            data = (await
                    gdrive_read(accessor, p,
                                _extra.get("index"))).decode(errors="replace")
            if z:
                all_lines.extend(data.split("\x00"))
            else:
                all_lines.extend(data.splitlines())
        if r:
            count = int(n) if n is not None else len(all_lines)
            all_lines = random.choices(all_lines, k=count)
        else:
            random.shuffle(all_lines)
            if n is not None:
                all_lines = all_lines[:int(n)]
        return (sep.join(all_lines) + sep).encode(), IOResult()
    raw = await _read_stdin_async(stdin)
    if raw is None:
        raise ValueError("shuf: missing operand")
    text = raw.decode(errors="replace")
    if z:
        lines = text.split("\x00")
    else:
        lines = text.splitlines()
    if r:
        count = int(n) if n is not None else len(lines)
        lines = random.choices(lines, k=count)
    else:
        random.shuffle(lines)
        if n is not None:
            lines = lines[:int(n)]
    return (sep.join(lines) + sep).encode(), IOResult()
