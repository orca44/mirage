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


def uniq(
    read_bytes: _ReadBytes,
    path: str,
    count: bool = False,
    duplicates_only: bool = False,
    unique_only: bool = False,
) -> list[str]:
    data = read_bytes(path).decode(errors="replace").splitlines()
    groups: list[tuple[str, int]] = []
    for line in data:
        if groups and groups[-1][0] == line:
            groups[-1] = (line, groups[-1][1] + 1)
        else:
            groups.append((line, 1))

    result: list[str] = []
    for line, cnt in groups:
        if duplicates_only and cnt == 1:
            continue
        if unique_only and cnt > 1:
            continue
        if count:
            result.append(f"{cnt:>7} {line}")
        else:
            result.append(line)
    return result
