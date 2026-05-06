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

import uuid

from mirage.accessor.ram import RAMAccessor
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ram.mkdir import mkdir as mkdir_core
from mirage.core.ram.write import write_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("mktemp", resource="ram", spec=SPECS["mktemp"], write=True)
async def mktemp(
    accessor: RAMAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    d: bool = False,
    p: str | None = None,
    t: bool = False,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    p_str = p.original if isinstance(p, PathSpec) else p
    parent = "/tmp" if t else (p_str if p_str else "/tmp")
    suffix = str(uuid.uuid4())[:8]
    template = texts[0] if texts else "tmp.XXXXXXXXXX"
    name = template.replace(
        "X" * template.count("X"),
        suffix) if "X" in template else f"{template}.{suffix}"
    path = f"{parent.rstrip('/')}/{name}"
    await mkdir_core(accessor, parent, parents=True)
    if d:
        await mkdir_core(accessor, path)
    else:
        await write_bytes(accessor, path, b"")
    return (path + "\n").encode(), IOResult()
