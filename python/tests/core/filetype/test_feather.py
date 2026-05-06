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

import io

import pandas as pd
import pyarrow as pa
import pyarrow.feather as feather
import pytest

from mirage.core.filetype.feather import cat, cut, grep, head, stat, tail, wc


def _make_feather(num_rows: int = 100) -> bytes:
    df = pd.DataFrame({
        "name": [f"user{i}" for i in range(num_rows)],
        "score":
        list(range(num_rows)),
        "grade": ["A" if i % 2 == 0 else "B" for i in range(num_rows)],
    })
    table = pa.Table.from_pandas(df)
    buf = io.BytesIO()
    feather.write_feather(table, buf)
    return buf.getvalue()


FEATHER_BYTES = _make_feather()
SMALL_FEATHER = _make_feather(num_rows=5)


class TestCat:

    def test_cat_returns_schema_and_preview(self):
        result = cat(FEATHER_BYTES)
        text = result.decode()
        assert "name:" in text
        assert "score: int64" in text
        assert "user0" in text

    def test_cat_limits_preview_rows(self):
        result = cat(FEATHER_BYTES, max_rows=5)
        text = result.decode()
        assert "user4" in text
        assert "user5" not in text

    def test_cat_small_file(self):
        result = cat(SMALL_FEATHER)
        text = result.decode()
        assert "user0" in text
        assert "user4" in text


class TestHead:

    def test_head_default_10_rows(self):
        result = head(FEATHER_BYTES)
        text = result.decode()
        assert "user0" in text
        assert "user9" in text

    def test_head_custom_n(self):
        result = head(FEATHER_BYTES, n=3)
        text = result.decode()
        assert "user2" in text
        assert "user3" not in text

    def test_head_includes_schema(self):
        result = head(FEATHER_BYTES, n=3)
        text = result.decode()
        assert "name:" in text


class TestTail:

    def test_tail_default_10_rows(self):
        result = tail(FEATHER_BYTES)
        text = result.decode()
        assert "user99" in text
        assert "user90" in text

    def test_tail_custom_n(self):
        result = tail(FEATHER_BYTES, n=3)
        text = result.decode()
        assert "user99" in text
        assert "user97" in text
        assert "user96" not in text

    def test_tail_includes_schema(self):
        result = tail(FEATHER_BYTES, n=3)
        text = result.decode()
        assert "name:" in text


class TestWc:

    def test_wc_returns_row_count(self):
        result = wc(FEATHER_BYTES)
        assert result == 100

    def test_wc_small(self):
        result = wc(SMALL_FEATHER)
        assert result == 5


class TestStat:

    def test_stat_includes_schema(self):
        result = stat(FEATHER_BYTES)
        text = result.decode()
        assert "name:" in text
        assert "score: int64" in text

    def test_stat_includes_row_count(self):
        result = stat(FEATHER_BYTES)
        text = result.decode()
        assert "100" in text

    def test_stat_header(self):
        result = stat(FEATHER_BYTES)
        text = result.decode()
        assert "Feather file" in text


class TestGrep:

    def test_grep_finds_matching_rows(self):
        result = grep(FEATHER_BYTES, "user1")
        text = result.decode()
        assert "user1," in text or "user1" in text

    def test_grep_case_insensitive(self):
        result = grep(FEATHER_BYTES, "USER1", ignore_case=True)
        text = result.decode()
        assert "user1" in text

    def test_grep_no_match(self):
        result = grep(FEATHER_BYTES, "nonexistent")
        text = result.decode()
        lines = [line for line in text.strip().splitlines() if line.strip()]
        assert len(lines) <= 1


class TestCut:

    def test_cut_single_column(self):
        result = cut(FEATHER_BYTES, columns=["name"])
        text = result.decode()
        assert "name" in text
        assert "score" not in text

    def test_cut_multiple_columns(self):
        result = cut(FEATHER_BYTES, columns=["name", "grade"])
        text = result.decode()
        assert "name" in text
        assert "grade" in text
        assert "score" not in text

    def test_cut_invalid_column(self):
        with pytest.raises(ValueError):
            cut(FEATHER_BYTES, columns=["nonexistent"])
