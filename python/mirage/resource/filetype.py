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

from mirage.types import FileType

EXTENSION_MAP: dict[str, FileType] = {
    "json": FileType.JSON,
    "jsonl": FileType.JSON,
    "csv": FileType.CSV,
    "tsv": FileType.CSV,
    "txt": FileType.TEXT,
    "md": FileType.TEXT,
    "py": FileType.TEXT,
    "js": FileType.TEXT,
    "ts": FileType.TEXT,
    "yaml": FileType.TEXT,
    "yml": FileType.TEXT,
    "toml": FileType.TEXT,
    "png": FileType.IMAGE_PNG,
    "jpg": FileType.IMAGE_PNG,
    "jpeg": FileType.IMAGE_JPEG,
    "gif": FileType.IMAGE_GIF,
    "zip": FileType.ZIP,
    "gz": FileType.GZIP,
    "pdf": FileType.PDF,
}

DEFAULT_TYPE = FileType.BINARY


def guess_type(path: str) -> FileType:
    """Return the file type for *path* based on its extension.

    Args:
        path (str): file path or name.

    Returns:
        FileType: matched type from EXTENSION_MAP, or DEFAULT_TYPE.
    """
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return EXTENSION_MAP.get(ext, DEFAULT_TYPE)
