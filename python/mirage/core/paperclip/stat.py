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

import os

from mirage.accessor.paperclip import PaperclipAccessor
from mirage.cache.index import IndexCacheStore
from mirage.types import FileStat, FileType, PathSpec

SOURCES = ["arxiv", "biorxiv", "medrxiv", "pmc"]
YEARS = [str(y) for y in range(2000, 2027)]
MONTHS = [f"{m:02d}" for m in range(1, 13)]
_PAPER_SUBDIRS = {"sections", "figures", "supplements"}

_EXT_MAP = {
    ".json": FileType.JSON,
    ".jsonl": FileType.TEXT,
    ".lines": FileType.TEXT,
    ".txt": FileType.TEXT,
    ".csv": FileType.CSV,
    ".pdf": FileType.PDF,
    ".jpg": FileType.IMAGE_JPEG,
    ".jpeg": FileType.IMAGE_JPEG,
    ".png": FileType.IMAGE_PNG,
    ".gif": FileType.IMAGE_GIF,
    ".tif": FileType.BINARY,
    ".tiff": FileType.BINARY,
    ".docx": FileType.BINARY,
}


def _file_type_from_name(name: str) -> FileType:
    _, ext = os.path.splitext(name)
    return _EXT_MAP.get(ext.lower(), FileType.TEXT)


async def stat(
    accessor: PaperclipAccessor,
    path: PathSpec,
    index: IndexCacheStore = None,
) -> FileStat:
    """Return file metadata for a virtual path in the Paperclip resource.

    Args:
        accessor (PaperclipAccessor): The Paperclip accessor instance.
        path (PathSpec): The virtual path to stat.
        index (IndexCacheStore): Optional index cache store.

    Returns:
        FileStat: Metadata for the path.

    Raises:
        FileNotFoundError: If the path does not resolve to a known resource.
    """
    if isinstance(path, str):
        path = PathSpec(original=path, directory=path)

    prefix = path.prefix
    raw = path.original

    if prefix and raw.startswith(prefix):
        raw = raw[len(prefix):] or "/"

    key = raw.strip("/")

    if not key:
        return FileStat(name="/", type=FileType.DIRECTORY)

    parts = key.split("/")

    if len(parts) == 1:
        if parts[0] in SOURCES:
            return FileStat(name=parts[0], type=FileType.DIRECTORY)
        raise FileNotFoundError(raw)

    if len(parts) == 2:
        if parts[0] in SOURCES and parts[1] in YEARS:
            return FileStat(name=parts[1], type=FileType.DIRECTORY)
        raise FileNotFoundError(raw)

    if len(parts) == 3:
        if parts[0] in SOURCES and parts[1] in YEARS and parts[2] in MONTHS:
            return FileStat(name=parts[2], type=FileType.DIRECTORY)
        raise FileNotFoundError(raw)

    if len(parts) == 4:
        if (parts[0] in SOURCES and parts[1] in YEARS and parts[2] in MONTHS
                and parts[3] not in MONTHS):
            return FileStat(name=parts[3], type=FileType.DIRECTORY)
        raise FileNotFoundError(raw)

    if len(parts) >= 5:
        if (parts[0] in SOURCES and parts[1] in YEARS and parts[2] in MONTHS
                and parts[3] not in MONTHS):
            tail = parts[4:]
            if len(tail) == 1:
                name = tail[0]
                if name in _PAPER_SUBDIRS:
                    return FileStat(name=name, type=FileType.DIRECTORY)
                return FileStat(name=name, type=_file_type_from_name(name))
            if len(tail) == 2 and tail[0] in _PAPER_SUBDIRS:
                name = tail[1]
                return FileStat(name=name, type=_file_type_from_name(name))

    raise FileNotFoundError(raw)
