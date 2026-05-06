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

import fnmatch
import posixpath

from mirage.accessor.paperclip import PaperclipAccessor
from mirage.cache.index import IndexCacheStore
from mirage.core.paperclip.readdir import readdir
from mirage.types import PathSpec


async def resolve_glob(
    accessor: PaperclipAccessor,
    paths: list[PathSpec],
    prefix: str = "",
    index: IndexCacheStore = None,
) -> list[PathSpec]:
    """Resolve glob patterns against the Paperclip virtual filesystem.

    Args:
        accessor (PaperclipAccessor): paperclip accessor.
        paths (list[PathSpec]): list of PathSpec objects.
        prefix (str): mount prefix.
        index (IndexCacheStore | None): index cache.
    """
    result: list[PathSpec] = []
    for p in paths:
        if isinstance(p, str):
            result.append(
                PathSpec(original=p,
                         directory=posixpath.dirname(p),
                         prefix=prefix))
            continue
        if p.resolved:
            result.append(p)
        elif p.pattern:
            entries = await readdir(accessor, p, index)
            for e in entries:
                name = e.rsplit("/", 1)[-1]
                if fnmatch.fnmatch(name, p.pattern):
                    result.append(PathSpec.from_str_path(e, p.prefix))
        else:
            result.append(p)
    return result
