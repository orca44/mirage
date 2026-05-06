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

import re
from collections.abc import AsyncIterator

from mirage.accessor.ssh import SSHAccessor
from mirage.cache.index import IndexCacheStore
from mirage.commands.builtin.utils.stream import _read_stdin_async
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.core.ssh.glob import resolve_glob
from mirage.core.ssh.read import read_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


def _expand_leading_tabs(text: str, tabsize: int) -> str:
    return re.sub(
        r"(?m)^\t+",
        lambda m: m.group().expandtabs(tabsize),
        text,
    )


@command("expand", resource="ssh", spec=SPECS["expand"])
async def expand(
    accessor: SSHAccessor,
    paths: list[PathSpec],
    *texts: str,
    stdin: AsyncIterator[bytes] | bytes | None = None,
    t: str | None = None,
    i: bool = False,
    index: IndexCacheStore = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    tabsize = int(t) if t is not None else 8
    expander = _expand_leading_tabs if i else lambda txt, ts: txt.expandtabs(ts
                                                                             )
    if paths:
        paths = await resolve_glob(accessor, paths, index)
        all_text: list[str] = []
        for p in paths:
            data = (await read_bytes(accessor, p)).decode(errors="replace")
            all_text.append(expander(data, tabsize))
        return "".join(all_text).encode(), IOResult()
    raw = await _read_stdin_async(stdin)
    if raw is None:
        raise ValueError("expand: missing operand")
    text = raw.decode(errors="replace")
    return expander(text, tabsize).encode(), IOResult()
