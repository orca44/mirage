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


class S3ResourceType(str, Enum):
    FILE = "file"
    FOLDER = "folder"


class S3IndexEntry(IndexEntry):
    """S3 resource index entry."""

    etag: str = ""

    @classmethod
    def from_object(cls, obj: dict) -> "S3IndexEntry":
        """Build entry from S3 ListObjectsV2 Contents item.

        Example::

            S3IndexEntry.from_object({
                "Key": "data/report.csv",
                "Size": 1024,
                "LastModified": datetime(...),
                "ETag": '"abc123"',
            })
        """
        key = obj["Key"]
        name = key.rstrip("/").rsplit("/", 1)[-1]
        modified = obj.get("LastModified")
        return cls(
            id=key,
            name=name,
            resource_type=S3ResourceType.FILE,
            vfs_name=name,
            size=obj.get("Size"),
            remote_time=modified.isoformat() if modified else "",
            etag=obj.get("ETag", ""),
        )

    @classmethod
    def from_prefix(cls, prefix: str) -> "S3IndexEntry":
        """Build entry from S3 CommonPrefixes item.

        Example::

            S3IndexEntry.from_prefix("data/subdir/")
        """
        name = prefix.rstrip("/").rsplit("/", 1)[-1]
        return cls(
            id=prefix,
            name=name,
            resource_type=S3ResourceType.FOLDER,
            vfs_name=name,
        )
