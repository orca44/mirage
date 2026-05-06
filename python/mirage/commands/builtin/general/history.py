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

from mirage.accessor.base import Accessor, NOOPAccessor
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec
from mirage.workspace.history import ExecutionHistory


@command("history", resource=None, spec=SPECS["history"])
async def history_cmd(
    accessor: Accessor = NOOPAccessor(),
    paths: list[PathSpec] | None = None,
    *texts: str,
    stdin: bytes | None = None,
    c: bool = False,
    history: ExecutionHistory | None = None,
    session_id: str | None = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    if history is None:
        return None, IOResult(
            exit_code=1,
            stderr=b"history: not enabled for this workspace\n",
        )
    if c:
        history.clear()
        return None, IOResult()
    all_entries = history.entries()
    scoped = ([r for r in all_entries if r.session_id == session_id]
              if session_id is not None else all_entries)
    n = None
    if texts:
        try:
            n = int(texts[0])
        except ValueError:
            err = f"history: {texts[0]}: numeric argument required\n".encode()
            return None, IOResult(exit_code=1, stderr=err)
    entries = scoped[-n:] if n is not None and n >= 0 else scoped
    total = len(scoped)
    width = len(str(total))
    start_idx = total - len(entries) + 1
    lines = [
        f"{str(start_idx + i).rjust(width)}  {rec.command}"
        for i, rec in enumerate(entries)
    ]
    output = "\n".join(lines) + ("\n" if lines else "")
    return output.encode(), IOResult()
