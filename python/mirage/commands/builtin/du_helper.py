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

from mirage.commands.builtin.utils.types import _Readdir, _Stat
from mirage.types import FileType


def du(
    readdir: _Readdir,
    stat_fn: _Stat,
    path: str,
    warnings: list[str] | None = None,
) -> int:
    total = 0
    try:
        s = stat_fn(path)
    except (FileNotFoundError, ValueError) as exc:
        if warnings is not None:
            warnings.append(f"du: cannot access '{path}': {exc}")
        return 0
    if s.type != FileType.DIRECTORY:
        return s.size or 0
    for entry in readdir(path):
        total += du(readdir, stat_fn, entry, warnings=warnings)
    return total


def du_all(
    readdir: _Readdir,
    stat_fn: _Stat,
    path: str,
    warnings: list[str] | None = None,
) -> list[tuple[str, int]]:
    results: list[tuple[str, int]] = []
    try:
        s = stat_fn(path)
    except (FileNotFoundError, ValueError) as exc:
        if warnings is not None:
            warnings.append(f"du: cannot access '{path}': {exc}")
        return results
    if s.type != FileType.DIRECTORY:
        return [(path, s.size or 0)]
    total = 0
    for entry in readdir(path):
        try:
            child = stat_fn(entry)
        except (FileNotFoundError, ValueError) as exc:
            if warnings is not None:
                warnings.append(f"du: cannot access '{entry}': {exc}")
            continue
        if child.type == FileType.DIRECTORY:
            sub = du_all(readdir, stat_fn, entry, warnings=warnings)
            sub_total = sub[-1][1] if sub else 0
            results.extend(sub)
            results.append((entry, sub_total))
            total += sub_total
        else:
            sz = child.size or 0
            results.append((entry, sz))
            total += sz
    results.append((path, total))
    return results
