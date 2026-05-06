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

from mirage.commands.builtin.constants import SCOPE_ERROR, SCOPE_SUGGEST
from mirage.types import FileType, PathSpec


async def count_scope(
    readdir_fn,
    stat_fn,
    path: PathSpec,
    recursive: bool,
    *,
    _count: int = 0,
) -> int:
    entries = await readdir_fn(path)
    total = _count
    for entry in entries:
        file_stat = await stat_fn(entry)
        if file_stat.type == FileType.DIRECTORY:
            if recursive:
                total = await count_scope(readdir_fn,
                                          stat_fn,
                                          entry,
                                          True,
                                          _count=total)
        else:
            total += 1
        if total > SCOPE_ERROR:
            return total
    return total


async def scope_warning(
    readdir_fn,
    stat_fn,
    scope: PathSpec,
    recursive: bool = False,
) -> str | None:
    total = await count_scope(readdir_fn, stat_fn, scope.directory, recursive)
    if total > SCOPE_ERROR:
        raise ValueError(
            f"scope too large: {total} files under {scope.directory}")
    if total > SCOPE_SUGGEST:
        return f"scanning {total} files under {scope.directory}"
    return None
