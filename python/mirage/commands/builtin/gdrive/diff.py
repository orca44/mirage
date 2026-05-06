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

import difflib
import re

from mirage.accessor.gdrive import GDriveAccessor
from mirage.commands.builtin.diff_helper import _ed_script
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.gdrive.glob import resolve_glob
from mirage.core.gdrive.read import read as gdrive_read
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("diff", resource="gdrive", spec=SPECS["diff"])
async def diff(
    accessor: GDriveAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: bytes | None = None,
    i: bool = False,
    w: bool = False,
    b: bool = False,
    e: bool = False,
    u: bool = False,
    q: bool = False,
    r: bool = False,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if len(paths) < 2:
        raise ValueError("diff: requires two paths")
    paths = await resolve_glob(accessor, paths, _extra.get("index"))
    if r:
        return b"", IOResult(
            stderr=b"diff: -r not supported for this resource",
            exit_code=1,
        )
    p0 = paths[0]
    p1 = paths[1]
    data_a = await gdrive_read(accessor, p0, _extra.get("index"))
    data_b = await gdrive_read(accessor, p1, _extra.get("index"))
    text_a = data_a.decode(errors="replace")
    text_b = data_b.decode(errors="replace")
    if i:
        text_a = text_a.lower()
        text_b = text_b.lower()
    if w:
        text_a = re.sub(r"\s+", "", text_a)
        text_b = re.sub(r"\s+", "", text_b)
    elif b:
        text_a = re.sub(r"[ \t]+", " ", text_a)
        text_b = re.sub(r"[ \t]+", " ", text_b)
    if q:
        if text_a != text_b:
            output = f"Files {p0.original} and {p1.original} differ\n".encode()
        else:
            output = b""
        exit_code = 1 if text_a != text_b else 0
        return output, IOResult(exit_code=exit_code)
    a_lines = text_a.splitlines(keepends=True)
    b_lines = text_b.splitlines(keepends=True)
    if e:
        result = _ed_script(a_lines, b_lines)
    else:
        result = list(
            difflib.unified_diff(a_lines,
                                 b_lines,
                                 fromfile=p0.original,
                                 tofile=p1.original))
    output = "".join(result).encode()
    exit_code = 1 if output else 0
    return output, IOResult(exit_code=exit_code)
