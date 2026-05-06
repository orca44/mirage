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

import time
from dataclasses import dataclass


@dataclass
class CacheEntry:
    file_id: str
    name: str
    mime_type: str
    modified_time: str
    size: int | None = None
    can_edit: bool = False
    owned_by_me: bool = False
    owner: str | None = None
    filename: str = ""


class FileCache:
    """Lazy cache mapping virtual paths to Google file IDs.

    Populated by readdir calls. Used by read/stat/fingerprint
    to resolve filenames to file IDs without re-listing.
    """

    def __init__(self, ttl: float = 300) -> None:
        self._entries: dict[str, CacheEntry] = {}
        self._dir_listed: dict[str, float] = {}
        self._ttl = ttl

    def get(self, path: str) -> CacheEntry | None:
        """Get a cached entry by virtual path.

        Args:
            path (str): virtual path (e.g. "owned/file.gdoc.json").

        Returns:
            CacheEntry | None: cached entry or None.
        """
        return self._entries.get(path.strip("/"))

    def put(self, path: str, entry: CacheEntry) -> None:
        """Store an entry in the cache.

        Args:
            path (str): virtual path.
            entry (CacheEntry): file metadata.
        """
        self._entries[path.strip("/")] = entry

    def list_dir(self, path: str) -> list[str] | None:
        """Get cached directory listing.

        Args:
            path (str): directory path.

        Returns:
            list[str] | None: cached entries or None if stale.
        """
        key = path.strip("/")
        ts = self._dir_listed.get(key)
        if ts is None or time.time() - ts > self._ttl:
            return None
        prefix = key + "/" if key else ""
        return sorted(k for k in self._entries
                      if k.startswith(prefix) and "/" not in k[len(prefix):])

    def set_dir(
        self,
        path: str,
        entries: list[tuple[str, CacheEntry]],
    ) -> None:
        """Cache a directory listing.

        Args:
            path (str): directory path.
            entries: list of (relative_name, CacheEntry).
        """
        key = path.strip("/")
        prefix = key + "/" if key else ""
        for name, entry in entries:
            self._entries[prefix + name] = entry
        self._dir_listed[key] = time.time()

    def clear(self) -> None:
        self._entries.clear()
        self._dir_listed.clear()
