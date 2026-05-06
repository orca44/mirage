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

from mirage.accessor.ram import RAMAccessor
from mirage.cache.index.ram import RAMIndexCacheStore
from mirage.ops import Ops
from mirage.ops.config import OpsMount
from mirage.resource.ram import RAMResource
from mirage.resource.ram.store import RAMStore
from mirage.types import MountMode


def _ram_registered_ops():
    resource = RAMResource()
    return resource.ops_list()


def run(coro):
    return asyncio.run(coro)


def make_ops(mode=MountMode.WRITE):
    store = RAMStore()
    accessor = RAMAccessor(store)
    mounts = [
        OpsMount(
            prefix="/data/",
            resource_type="ram",
            accessor=accessor,
            index=RAMIndexCacheStore(),
            mode=mode,
            ops=_ram_registered_ops(),
        )
    ]
    ops = Ops(mounts)
    return ops, store


def make_ops_with_dir(mode=MountMode.WRITE):
    ops, store = make_ops(mode)
    asyncio.run(ops.mkdir("/data/dir"))
    return ops, store
