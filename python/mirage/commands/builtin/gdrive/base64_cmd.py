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

import base64 as b64lib
from collections.abc import AsyncIterator

from mirage.accessor.gdrive import GDriveAccessor
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.gdrive.glob import resolve_glob
from mirage.core.gdrive.read import read as gdrive_read
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("base64", resource="gdrive", spec=SPECS["base64"])
async def base64_cmd(
    accessor: GDriveAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    d: bool = False,
    D: bool = False,
    w: str | None = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if paths:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        p = paths[0]
        raw = await gdrive_read(accessor, p, _extra.get("index"))
    else:
        raw = await _read_stdin_async(stdin)
        if raw is None:
            raise ValueError("base64: missing input")

    decode = d or D
    if decode:
        text = raw.replace(b"\n", b"").replace(b"\r", b"").replace(b" ", b"")
        return b64lib.b64decode(text), IOResult()

    encoded = b64lib.b64encode(raw).decode()
    wrap = int(w) if w is not None else None
    if wrap is not None and wrap == 0:
        return (encoded + "\n").encode(), IOResult()
    line_len = wrap if wrap is not None else 76
    lines: list[str] = []
    for i in range(0, len(encoded), line_len):
        lines.append(encoded[i:i + line_len])
    return ("\n".join(lines) + "\n").encode(), IOResult()
