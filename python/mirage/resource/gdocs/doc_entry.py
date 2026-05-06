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

import re
from dataclasses import dataclass

TITLE_MAX_CHARS = 100
UNSAFE_CHARS = re.compile(r'[^\w\s\-.]')
MULTI_UNDERSCORE = re.compile(r'_+')


@dataclass
class DocEntry:
    id: str
    name: str
    modified_time: str
    created_time: str
    owner: str | None
    owned_by_me: bool
    can_edit: bool
    filename: str


def sanitize_title(title: str) -> str:
    """Sanitize a document title for use in filenames.

    Args:
        title (str): raw document title.

    Returns:
        str: sanitized title, max 100 chars.
    """
    if not title.strip():
        return "Untitled"
    cleaned = UNSAFE_CHARS.sub("_", title)
    cleaned = cleaned.replace(" ", "_")
    cleaned = MULTI_UNDERSCORE.sub("_", cleaned)
    cleaned = cleaned.strip("_")
    if len(cleaned) > TITLE_MAX_CHARS:
        cleaned = cleaned[:TITLE_MAX_CHARS - 3] + "..."
    return cleaned


def make_filename(title: str, doc_id: str, modified_time: str = "") -> str:
    """Build a filename from title, doc ID, and modified date.

    Args:
        title (str): raw document title.
        doc_id (str): Google Docs document ID.
        modified_time (str): ISO 8601 timestamp.

    Returns:
        str: filename in format "YYYY-MM-DD_Sanitized_Title__docid.json".
    """
    date_prefix = modified_time[:10] if len(modified_time) >= 10 else ""
    if date_prefix:
        return f"{date_prefix}_{sanitize_title(title)}__{doc_id}.gdoc.json"
    return f"{sanitize_title(title)}__{doc_id}.gdoc.json"
