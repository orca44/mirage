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

from typing import Callable

from mirage.commands.builtin.utils.types import _Readdir, _Stat
from mirage.types import FileType


def _rm_recursive(
    readdir: _Readdir,
    stat_fn: _Stat,
    unlink_fn: Callable[[str], None],
    rmdir_fn: Callable[[str], None],
    path: str,
) -> None:
    for entry in readdir(path):
        try:
            s = stat_fn(entry)
        except (FileNotFoundError, ValueError):
            continue
        if s.type == FileType.DIRECTORY:
            _rm_recursive(readdir, stat_fn, unlink_fn, rmdir_fn, entry)
        else:
            unlink_fn(entry)
    rmdir_fn(path)


def rm(
    stat_fn: _Stat,
    readdir: _Readdir,
    unlink_fn: Callable[[str], None],
    rmdir_fn: Callable[[str], None],
    path: str,
    recursive: bool = False,
    force: bool = False,
) -> None:
    try:
        s = stat_fn(path)
    except (FileNotFoundError, ValueError):
        if force:
            return
        raise
    if s.type == FileType.DIRECTORY:
        if not recursive:
            raise IsADirectoryError(
                f"{path}: is a directory (use recursive=True)")
        _rm_recursive(readdir, stat_fn, unlink_fn, rmdir_fn, path)
    else:
        unlink_fn(path)
