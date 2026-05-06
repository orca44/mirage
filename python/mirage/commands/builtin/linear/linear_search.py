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

import json

from mirage.accessor.linear import LinearAccessor
from mirage.commands.registry import command
from mirage.commands.spec.types import CommandSpec, OperandKind, Option
from mirage.core.linear._client import search_issues
from mirage.io.stream import yield_bytes
from mirage.io.types import ByteSource, IOResult
from mirage.types import PathSpec

SPEC = CommandSpec(options=(Option(long="--query",
                                   value_kind=OperandKind.TEXT), ), )


@command("linear-search", resource="linear", spec=SPEC)
async def linear_search(
    accessor: LinearAccessor,
    paths: list[PathSpec],
    *texts: str,
    **_extra: object,
) -> tuple[ByteSource | None, IOResult]:
    query = _extra.get("query")
    if not query or not isinstance(query, str):
        raise ValueError("--query is required")
    results = await search_issues(accessor.config, query)
    return yield_bytes(
        json.dumps(results, ensure_ascii=False,
                   indent=2).encode()), IOResult()
