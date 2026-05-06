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

from mirage.accessor.gdrive import GDriveAccessor
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.gdrive.glob import resolve_glob
from mirage.core.gdrive.read import read as gdrive_read
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _comparison_key(
    line: str,
    skip_fields: int,
    skip_chars: int,
    check_chars: int,
    ignore_case: bool,
) -> str:
    text = line
    if skip_fields > 0:
        parts = text.split()
        remaining = parts[skip_fields:] if skip_fields < len(parts) else []
        text = " ".join(remaining)
    if skip_chars > 0:
        text = text[skip_chars:]
    if check_chars > 0:
        text = text[:check_chars]
    if ignore_case:
        text = text.lower()
    return text


@command("uniq", resource="gdrive", spec=SPECS["uniq"])
async def uniq(
    accessor: GDriveAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    c: bool = False,
    d: bool = False,
    u: bool = False,
    f: str | None = None,
    s: str | None = None,
    i: bool = False,
    w: str | None = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    skip_fields = int(f) if f else 0
    skip_chars = int(s) if s else 0
    check_chars = int(w) if w else 0
    if paths:
        paths = await resolve_glob(accessor, paths, _extra.get("index"))
        p = paths[0]
        data = await gdrive_read(accessor, p, _extra.get("index"))
        raw_text = data.decode(errors="replace")
    else:
        raw = await _read_stdin_async(stdin)
        if raw is None:
            raise ValueError("uniq: missing operand")
        raw_text = raw.decode(errors="replace")
    lines = raw_text.splitlines()
    result: list[str] = []
    prev_key: str | None = None
    prev_line: str | None = None
    prev_count = 0
    for line in lines:
        key = _comparison_key(line, skip_fields, skip_chars, check_chars, i)
        if key == prev_key:
            prev_count += 1
        else:
            if prev_line is not None:
                if not (d and prev_count == 1) and not (u and prev_count > 1):
                    if c:
                        result.append(f"{prev_count:>7} {prev_line}")
                    else:
                        result.append(prev_line)
            prev_line = line
            prev_key = key
            prev_count = 1
    if prev_line is not None:
        if not (d and prev_count == 1) and not (u and prev_count > 1):
            if c:
                result.append(f"{prev_count:>7} {prev_line}")
            else:
                result.append(prev_line)
    output = "\n".join(result) + "\n" if result else ""
    return output.encode(), IOResult()
