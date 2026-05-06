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
from mirage.types import FileStat, FileType


def ls(
    readdir: _Readdir,
    stat_fn: _Stat,
    path: str,
    long: bool = False,
    all_files: bool = False,
    sort_by: str = "name",
    reverse: bool = False,
    human_readable: bool = False,
    recursive: bool = False,
    list_dir: bool = False,
    warnings: list[str] | None = None,
) -> list[FileStat]:
    if list_dir:
        entries = [stat_fn(path)]
    else:
        raw = readdir(path)
        entries = []
        for e in raw:
            try:
                entries.append(stat_fn(e))
            except (FileNotFoundError, ValueError) as exc:
                if warnings is not None:
                    warnings.append(f"ls: cannot access '{e}': {exc}")

    if not all_files:
        entries = [e for e in entries if not e.name.startswith(".")]

    if sort_by == "time":
        entries = sorted(entries,
                         key=lambda e: e.modified or "",
                         reverse=not reverse)
    elif sort_by == "size":
        entries = sorted(entries,
                         key=lambda e: e.size or 0,
                         reverse=not reverse)
    else:
        entries = sorted(entries, key=lambda e: e.name, reverse=reverse)

    if recursive:
        all_entries: list[FileStat] = []
        for e in entries:
            all_entries.append(e)
            if e.type == FileType.DIRECTORY:
                sub = ls(readdir,
                         stat_fn,
                         path.rstrip("/") + "/" + e.name,
                         long=long,
                         all_files=all_files,
                         sort_by=sort_by,
                         reverse=reverse,
                         human_readable=human_readable,
                         recursive=True,
                         warnings=warnings)
                all_entries.extend(sub)
        entries = all_entries

    return entries
