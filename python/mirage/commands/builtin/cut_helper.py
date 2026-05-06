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

from mirage.commands.builtin.utils.types import _ReadBytes


def cut(
    read_bytes: _ReadBytes,
    path: str,
    delimiter: str = "\t",
    fields: list[int] | None = None,
    chars: list[tuple[int, int]] | None = None,
) -> list[str]:
    data = read_bytes(path).decode(errors="replace").splitlines()
    result: list[str] = []
    for line in data:
        if chars is not None:
            parts = []
            for start, end in chars:
                parts.append(line[start - 1:end])
            result.append("".join(parts))
        elif fields:
            parts_f = line.split(delimiter)
            selected = [
                parts_f[f - 1] for f in fields if 0 < f <= len(parts_f)
            ]
            result.append(delimiter.join(selected))
        else:
            result.append(line)
    return result
