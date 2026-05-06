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


@command("scan", resource="paperclip", spec=SPECS.get("grep", SPECS["cat"]))
async def scan(
    accessor: PaperclipAccessor,
    paths: list[PathSpec],
    *texts: str,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    """Multi-keyword search within a paper file.

    Args:
        accessor (PaperclipAccessor): Paperclip accessor.
        paths (list[PathSpec]): First path is the paper file path.
        texts (str): Keywords to search for.
    """
    paper_path = paths[0].original if isinstance(paths[0],
                                                 PathSpec) else paths[0]
    keywords = " ".join(f'"{kw}"' for kw in texts)
    result = await accessor.execute("scan", f"{paper_path} {keywords}")
    output = result.get("output", "").encode()
    return output, IOResult(exit_code=0)
