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

from enum import Enum

from mirage.cache.index.config import IndexEntry


class GitHubResourceType(str, Enum):
    BLOB = "blob"
    TREE = "tree"


class GitHubIndexEntry(IndexEntry):
    """GitHub resource index entry."""

    sha: str = ""

    @classmethod
    def from_tree_item(cls, item: dict) -> "GitHubIndexEntry":
        """Build entry from GitHub tree API item.

        Example::

            GitHubIndexEntry.from_tree_item({
                "path": "src/main.py",
                "type": "blob",
                "sha": "abc123",
                "size": 512,
            })
        """
        path = item["path"]
        name = path.rsplit("/", 1)[-1]
        return cls(
            id=item["sha"],
            name=name,
            resource_type=item["type"],
            vfs_name=name,
            size=item.get("size"),
            sha=item["sha"],
        )
