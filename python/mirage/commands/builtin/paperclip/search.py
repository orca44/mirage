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
from mirage.core.paperclip.readdir import SOURCES
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec


@command("search", resource="paperclip", spec=SPECS.get("grep", SPECS["cat"]))
async def search(
    accessor: PaperclipAccessor,
    paths: list[PathSpec],
    *texts: str,
    n: str | None = None,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    """Search papers with optional source/year scoping.

    Args:
        accessor (PaperclipAccessor): Paperclip accessor.
        paths (list[PathSpec]): Optional paths to scope by source/year.
        texts (str): Query terms.
        n (str | None): Number of results.
    """
    query = " ".join(texts)
    flags = ""
    if n:
        flags += f"-n {n}"
    if paths:
        p = paths[0] if isinstance(paths[0], PathSpec) else PathSpec(
            original=paths[0], directory=paths[0])
        stripped = p.strip_prefix if p.prefix else p.original
        parts = stripped.strip("/").split("/")
        if parts and parts[0] in SOURCES:
            flags += f" --source {parts[0]}"
        if len(parts) > 1:
            flags += f" --year {parts[1]}"
    flags = flags.strip()
    cmd_str = f'{flags} "{query}"' if flags else f'"{query}"'
    result = await accessor.execute("search", cmd_str)
    output = result.get("output", "").encode()
    return output, IOResult(exit_code=0)
