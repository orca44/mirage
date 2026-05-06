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
import builtins

from mirage.ops import Ops
from mirage.ops.file import MirageFile


def make_open(ops: Ops, loop: asyncio.AbstractEventLoop | None = None):
    """Create a patched open() that routes mounted paths through ops.

    Args:
        ops (Ops): The ops instance with mount table.
        loop (asyncio.AbstractEventLoop | None): Shared event loop.

    Returns:
        Callable: A patched open function.
    """
    original = builtins.open

    def patched_open(file, mode="r", **kwargs):
        if isinstance(file, str) and ops.is_mounted(file):
            return MirageFile(ops, file, mode, loop=loop, **kwargs)
        return original(file, mode, **kwargs)

    return patched_open
