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

import csv
import io

from mirage.core.jq.format import JQ_EMPTY


def _flatten_recursive(obj: list) -> list:
    result: list = []
    for item in obj:
        if isinstance(item, list):
            result.extend(_flatten_recursive(item))
        else:
            result.append(item)
    return result


def builtin_type(obj: object) -> str:
    if isinstance(obj, dict):
        return "object"
    if isinstance(obj, list):
        return "array"
    if isinstance(obj, str):
        return "string"
    if isinstance(obj, bool):
        return "boolean"
    if isinstance(obj, (int, float)):
        return "number"
    if obj is None:
        return "null"
    return "unknown"


def builtin_unique(obj: object) -> object:
    if not isinstance(obj, list):
        return obj
    seen: list = []
    for item in obj:
        if item not in seen:
            seen.append(item)
    return seen


def builtin_add(obj: object) -> object:
    if not isinstance(obj, list) or not obj:
        return None if isinstance(obj, list) else obj
    acc = obj[0]
    for item in obj[1:]:
        acc = acc + item
    return acc


def builtin_tonumber(obj: object) -> object:
    if isinstance(obj, str):
        return float(obj) if "." in obj else int(obj)
    if isinstance(obj, (int, float)):
        return obj
    raise TypeError(f"cannot convert {type(obj).__name__} to number")


def builtin_csv(obj: object) -> str:
    if isinstance(obj, list):
        buf = io.StringIO()
        csv.writer(buf, quoting=csv.QUOTE_ALL).writerow(obj)
        return buf.getvalue().rstrip("\r\n")
    return str(obj)


def builtin_empty(_obj: object) -> object:
    return JQ_EMPTY


BUILTIN_OPS: dict[str, object] = {
    ".":
    lambda obj: obj,
    "length":
    lambda obj: len(obj),
    "keys":
    lambda obj: sorted(obj.keys())
    if isinstance(obj, dict) else list(range(len(obj))),
    "values":
    lambda obj: list(obj.values()) if isinstance(obj, dict) else list(obj),
    "type":
    builtin_type,
    "unique":
    builtin_unique,
    "not":
    lambda obj: not obj,
    "null":
    lambda _: None,
    "true":
    lambda _: True,
    "false":
    lambda _: False,
    "empty":
    builtin_empty,
    "add":
    builtin_add,
    "tonumber":
    builtin_tonumber,
    "tostring":
    lambda obj: obj if isinstance(obj, str) else str(obj),
    "@csv":
    builtin_csv,
    "@tsv":
    lambda obj: "\t".join(str(v) for v in obj)
    if isinstance(obj, list) else str(obj),
    "flatten":
    lambda obj: _flatten_recursive(obj) if isinstance(obj, list) else obj,
    "sort":
    lambda obj: sorted(obj, key=lambda x: (str(type(x).__name__), x))
    if isinstance(obj, list) else obj,
    "reverse":
    lambda obj: list(reversed(obj))
    if isinstance(obj, list) else (obj[::-1] if isinstance(obj, str) else obj),
    "first":
    lambda obj: obj[0] if isinstance(obj, list) and obj else obj,
    "last":
    lambda obj: obj[-1] if isinstance(obj, list) and obj else obj,
    "min":
    lambda obj: min(obj)
    if isinstance(obj, list) and obj else (None
                                           if isinstance(obj, list) else obj),
    "max":
    lambda obj: max(obj)
    if isinstance(obj, list) and obj else (None
                                           if isinstance(obj, list) else obj),
    "any":
    lambda obj: any(obj) if isinstance(obj, list) else bool(obj),
    "all":
    lambda obj: all(obj) if isinstance(obj, list) else bool(obj),
}
