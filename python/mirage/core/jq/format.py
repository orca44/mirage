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

import orjson

JQ_EMPTY: object = object()


def _format_one(value: object, raw: bool, compact: bool) -> bytes:
    if raw and isinstance(value, str):
        return value.encode() + b"\n"
    if compact:
        return orjson.dumps(value) + b"\n"
    return orjson.dumps(value, option=orjson.OPT_INDENT_2) + b"\n"


def format_jq_output(
    result: object,
    raw: bool,
    compact: bool,
    spread: bool,
) -> bytes:
    if result is JQ_EMPTY:
        return b""
    if spread and isinstance(result, list):
        parts: list[bytes] = []
        for item in result:
            parts.append(_format_one(item, raw, compact))
        return b"".join(parts)
    return _format_one(result, raw, compact)
