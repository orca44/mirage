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

from mirage.core.jq import JQ_EMPTY, format_jq_output, jq_eval


def test_format_jq_empty_sentinel_is_empty_bytes():
    assert format_jq_output(JQ_EMPTY, raw=False, compact=False,
                            spread=False) == b""
    assert format_jq_output(JQ_EMPTY, raw=True, compact=True,
                            spread=True) == b""


def test_format_jq_single_value_compact():
    assert format_jq_output({"a": 1}, raw=False, compact=True,
                            spread=False) == b'{"a":1}\n'


def test_format_jq_raw_string():
    assert format_jq_output("hello", raw=True, compact=True,
                            spread=False) == b"hello\n"


def test_format_jq_spread_serializes_each_item():
    out = format_jq_output([1, 2, 3], raw=False, compact=True, spread=True)
    assert out == b"1\n2\n3\n"


def test_format_jq_spread_off_keeps_array_as_one_value():
    out = format_jq_output([1, 2, 3], raw=False, compact=True, spread=False)
    assert out == b"[1,2,3]\n"


def test_attachments_missing_returns_empty():
    """Reproducer for the 'jq: DropItem' regression: an `[]?` over a
    missing field used to leak the internal sentinel exception. Now it
    must serialize to empty output."""
    msg = {"id": "x", "subject": "hi", "body_text": "..."}
    result = jq_eval(msg, ".attachments[]?")
    assert result is JQ_EMPTY
    assert format_jq_output(result, raw=True, compact=True, spread=True) == b""


def test_select_no_match_returns_empty():
    result = jq_eval({"x": 1}, "select(.x > 100)")
    assert result is JQ_EMPTY
    assert format_jq_output(result, raw=False, compact=True,
                            spread=False) == b""
