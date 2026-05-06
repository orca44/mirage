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

import asyncio


class KeyLockMixin:
    """Per-key async locking for RAM-backed cache stores.

    Provides fine-grained locking so operations on different keys
    run concurrently while same-key operations are serialized.

    Only for in-process RAM stores. Redis/SQLite backends handle
    concurrency natively and do not need this mixin.
    """

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._key_locks: dict[str, asyncio.Lock] = {}

    def _lock_for(self, key: str) -> asyncio.Lock:
        if key not in self._key_locks:
            self._key_locks[key] = asyncio.Lock()
        return self._key_locks[key]

    def _discard_lock(self, key: str) -> None:
        self._key_locks.pop(key, None)

    def _clear_locks(self) -> None:
        self._key_locks.clear()
