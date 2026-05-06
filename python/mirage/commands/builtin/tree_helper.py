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

import fnmatch

from mirage.commands.builtin.utils.types import _Readdir, _Stat
from mirage.types import FileType


def tree(
    readdir: _Readdir,
    stat_fn: _Stat,
    path: str,
    _prefix: str = "",
    max_depth: int | None = None,
    show_hidden: bool = False,
    ignore_pattern: str | None = None,
    _depth: int = 0,
    warnings: list[str] | None = None,
) -> list[str]:
    lines: list[str] = []
    try:
        entries = readdir(path)
    except (FileNotFoundError, ValueError) as exc:
        if warnings is not None:
            warnings.append(f"tree: '{path}': {exc}")
        return lines
    filtered = []
    for entry in entries:
        try:
            s = stat_fn(entry)
        except (FileNotFoundError, ValueError) as exc:
            if warnings is not None:
                warnings.append(f"tree: '{entry}': {exc}")
            continue
        if not show_hidden and s.name.startswith("."):
            continue
        if ignore_pattern and fnmatch.fnmatch(s.name, ignore_pattern):
            continue
        filtered.append((entry, s))
    for i, (entry, s) in enumerate(filtered):
        is_last = i == len(filtered) - 1
        connector = "\u2514\u2500\u2500 " if is_last else "\u251c\u2500\u2500 "
        lines.append(_prefix + connector + s.name)
        if s.type == FileType.DIRECTORY:
            if max_depth is not None and _depth >= max_depth:
                continue
            extension = "    " if is_last else "\u2502   "
            lines.extend(
                tree(readdir,
                     stat_fn,
                     entry,
                     _prefix + extension,
                     max_depth=max_depth,
                     show_hidden=show_hidden,
                     ignore_pattern=ignore_pattern,
                     _depth=_depth + 1,
                     warnings=warnings))
    return lines
