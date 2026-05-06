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

import json
from collections import deque

from mirage.workspace.types import ExecutionRecord


class ExecutionHistory:
    """Bounded execution history with optional JSONL persistence.

    Args:
        max_entries (int): Maximum number of records kept in memory.
        persist_path (str | None): Path to JSONL file for on-disk persistence.
    """

    def __init__(
        self,
        max_entries: int = 100,
        persist_path: str | None = None,
    ) -> None:
        self._buffer: deque[ExecutionRecord] = deque(maxlen=max_entries)
        self._persist_path = persist_path

    def append(self, record: ExecutionRecord) -> None:
        self._buffer.append(record)
        if self._persist_path is not None:
            with open(self._persist_path, "a") as f:
                f.write(json.dumps(record.to_dict()) + "\n")

    def entries(self) -> list[ExecutionRecord]:
        return list(self._buffer)

    def clear(self) -> None:
        self._buffer.clear()
