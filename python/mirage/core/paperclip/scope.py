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

from mirage.core.paperclip.readdir import MONTHS, SOURCES, YEARS
from mirage.types import PathSpec


@dataclass
class PaperclipScope:
    """Resolved scope for a Paperclip path.

    Attributes:
        level (str): "root", "source", "year", "month", "paper", or "file".
        source (str | None): Source name (biorxiv, medrxiv, pmc).
        year (str | None): Four-digit year string.
        month (str | None): Two-digit month string.
        paper_id (str | None): Paper filesystem ID.
        resource_path (str): Resource-relative path (prefix stripped).
    """

    level: str
    source: str | None = None
    year: str | None = None
    month: str | None = None
    paper_id: str | None = None
    resource_path: str = "/"


def detect_scope(path: PathSpec | str) -> PaperclipScope:
    """Determine scope from a Paperclip virtual path.

    Args:
        path (PathSpec | str): Virtual path or PathSpec.

    Returns:
        PaperclipScope: Resolved scope.
    """
    prefix = ""
    if isinstance(path, PathSpec):
        prefix = path.prefix
        raw = path.original
    else:
        raw = path

    if prefix and raw.startswith(prefix):
        key = raw[len(prefix):]
    else:
        key = raw
    key = key.strip("/")

    if not key:
        return PaperclipScope(level="root", resource_path="/")

    parts = key.split("/")

    if len(parts) == 1 and parts[0] in SOURCES:
        return PaperclipScope(
            level="source",
            source=parts[0],
            resource_path=key,
        )

    if len(parts) == 2 and parts[0] in SOURCES and parts[1] in YEARS:
        return PaperclipScope(
            level="year",
            source=parts[0],
            year=parts[1],
            resource_path=key,
        )

    if (len(parts) == 3 and parts[0] in SOURCES and parts[1] in YEARS
            and parts[2] in MONTHS):
        return PaperclipScope(
            level="month",
            source=parts[0],
            year=parts[1],
            month=parts[2],
            resource_path=key,
        )

    if len(parts) == 4 and parts[0] in SOURCES:
        return PaperclipScope(
            level="paper",
            source=parts[0],
            year=parts[1],
            month=parts[2],
            paper_id=parts[3],
            resource_path=key,
        )

    if len(parts) >= 5 and parts[0] in SOURCES:
        return PaperclipScope(
            level="file",
            source=parts[0],
            year=parts[1],
            month=parts[2],
            paper_id=parts[3],
            resource_path=key,
        )

    return PaperclipScope(level="file", resource_path=key)
