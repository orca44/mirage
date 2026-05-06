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

from mirage.core.github.tree_entry import TreeEntry


def should_use_search(
    is_regex: bool,
    recursive: bool,
    on_default_branch: bool,
) -> bool:
    """Whether grep/rg should narrow paths via GitHub code search.

    Search is appropriate for non-regex patterns running recursively on the
    default branch (code search only indexes the default branch).
    """
    return not is_regex and recursive and on_default_branch


async def estimate_scope(tree: dict[str, TreeEntry], directory: str,
                         pattern: str) -> tuple[int, int]:
    key = directory
    prefix = key + "/" if key else ""
    file_count = 0
    total_bytes = 0
    for p, entry in tree.items():
        if not p.startswith(prefix):
            continue
        remainder = p[len(prefix):]
        if entry.type == "blob" and fnmatch.fnmatch(remainder, pattern):
            file_count += 1
            total_bytes += entry.size or 0
    return file_count, total_bytes
