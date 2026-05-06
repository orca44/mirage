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


@dataclass
class OpRecord:
    """A single observed I/O operation.

    Args:
        op (str): Operation type ("read", "write", "stat", "readdir", etc.).
        path (str): Virtual path.
        source (str): Resource name ("s3", "ram", "disk").
        bytes (int): Bytes transferred (0 for metadata ops).
        timestamp (int): UTC epoch milliseconds.
        duration_ms (int): Wall-clock duration.
    """

    op: str
    path: str
    source: str
    bytes: int
    timestamp: int
    duration_ms: int

    @property
    def is_cache(self) -> bool:
        """Whether this op was served from the in-memory cache."""
        return self.source == "ram"
