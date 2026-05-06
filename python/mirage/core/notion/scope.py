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

from dataclasses import dataclass

from mirage.commands.builtin.constants import SCOPE_ERROR, SCOPE_SUGGEST
from mirage.types import FileType, PathSpec


@dataclass
class NotionScope:
    use_native: bool
    page_id: str | None = None
    resource_path: str = "/"


def detect_scope(path: PathSpec) -> NotionScope:
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)
    prefix = path.prefix or ""

    if path.pattern:
        dir_key = path.directory.strip("/")
        if prefix:
            dir_key = dir_key.removeprefix(prefix.strip("/") + "/")
        parts = dir_key.split("/") if dir_key else []
        if parts and parts[0] == "pages" and len(parts) >= 2:
            return NotionScope(use_native=True, resource_path=dir_key)

    key = path.key
    if not key:
        return NotionScope(use_native=True, resource_path="/")

    parts = key.split("/")

    if parts[0] != "pages":
        return NotionScope(use_native=False, resource_path=key)

    if len(parts) == 1:
        return NotionScope(use_native=True, resource_path=key)

    if parts[-1] == "page.json":
        page_dirname = parts[-2] if len(parts) >= 2 else ""
        page_id = page_dirname.rpartition("__")[2] or None
        return NotionScope(
            use_native=False,
            page_id=page_id,
            resource_path=key,
        )

    page_id = parts[-1].rpartition("__")[2] or None
    return NotionScope(
        use_native=True,
        page_id=page_id,
        resource_path=key,
    )


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
