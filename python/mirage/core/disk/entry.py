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


class DiskResourceType(str, Enum):
    FILE = "file"
    FOLDER = "folder"


class DiskIndexEntry(IndexEntry):
    """Disk resource index entry."""

    @classmethod
    def file(
        cls,
        path: str,
        size: int = 0,
        modified: str = "",
    ) -> "DiskIndexEntry":
        """Build entry for a disk file.

        Example::

            DiskIndexEntry.file("/docs/readme.txt", size=1024)
        """
        name = path.rsplit("/", 1)[-1]
        return cls(
            id=path,
            name=name,
            resource_type=DiskResourceType.FILE,
            vfs_name=name,
            size=size,
            remote_time=modified,
        )

    @classmethod
    def folder(
        cls,
        path: str,
        modified: str = "",
    ) -> "DiskIndexEntry":
        """Build entry for a disk directory.

        Example::

            DiskIndexEntry.folder("/docs/subdir")
        """
        name = path.rsplit("/", 1)[-1]
        return cls(
            id=path,
            name=name,
            resource_type=DiskResourceType.FOLDER,
            vfs_name=name,
            remote_time=modified,
        )
