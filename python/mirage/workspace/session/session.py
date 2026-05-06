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
from dataclasses import dataclass, field

from mirage.io.async_line_iterator import AsyncLineIterator


@dataclass
class Session:
    session_id: str
    cwd: str = "/"
    env: dict[str, str] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    functions: dict[str, object] = field(default_factory=dict)
    last_exit_code: int = 0
    _stdin_buffer: AsyncLineIterator | None = field(default=None, repr=False)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "cwd": self.cwd,
            "env": self.env,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Session":
        return cls(**data)
