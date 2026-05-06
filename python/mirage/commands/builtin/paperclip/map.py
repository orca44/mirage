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

from mirage.accessor.paperclip import PaperclipAccessor
from mirage.commands.registry import command
from mirage.commands.spec import SPECS
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("map", resource="paperclip", spec=SPECS["cat"])
async def map_cmd(
    accessor: PaperclipAccessor,
    paths: list[PathSpec],
    *texts: str,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    """Summarize across papers from a previous search.

    Args:
        accessor (PaperclipAccessor): Paperclip accessor.
        paths (list[PathSpec]): Unused.
        texts (str): Raw arguments including --from flag and question.
    """
    raw = " ".join(texts)
    result = await accessor.execute("map", raw)
    output = result.get("output", "").encode()
    return output, IOResult(exit_code=0)
