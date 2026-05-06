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

from mirage.commands.builtin.utils.types import _ReadBytes


def _should_number(line: str, mode: str,
                   pattern: re.Pattern[str] | None) -> bool:
    if mode == "n":
        return False
    if mode == "a":
        return True
    if mode == "p" and pattern is not None:
        return pattern.search(line) is not None
    return bool(line.strip())


def nl(
    read_bytes: _ReadBytes,
    path: str,
    body_numbering: str = "t",
    start: int = 1,
    increment: int = 1,
    width: int = 6,
    separator: str = "\t",
) -> str:
    pattern: re.Pattern[str] | None = None
    mode = body_numbering
    if body_numbering.startswith("p"):
        mode = "p"
        pattern = re.compile(body_numbering[1:])
    data = read_bytes(path).decode(errors="replace")
    lines = data.splitlines()
    result: list[str] = []
    num = start
    for line in lines:
        if _should_number(line, mode, pattern):
            result.append(f"{num:{width}d}{separator}{line}")
            num += increment
        else:
            result.append(f"{' ' * width}{separator}{line}")
    return "\n".join(result)
