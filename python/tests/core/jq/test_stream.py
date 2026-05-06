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
import pytest

from mirage.core.jq.stream import parse_json_auto


def test_parse_json_auto_empty_raises_clear_error():
    with pytest.raises(ValueError, match="empty input"):
        parse_json_auto(b"")


def test_parse_json_auto_whitespace_raises_clear_error():
    with pytest.raises(ValueError, match="empty input"):
        parse_json_auto(b"   \n\n  ")


def test_parse_json_auto_single_value():
    assert parse_json_auto(b'{"a":1}') == {"a": 1}
    assert parse_json_auto(b"42") == 42


def test_parse_json_auto_ndjson():
    assert parse_json_auto(b'{"a":1}\n{"b":2}') == [{"a": 1}, {"b": 2}]


def test_parse_json_auto_single_line_garbage_propagates_error():
    with pytest.raises(orjson.JSONDecodeError):
        parse_json_auto(b"this is not json")
