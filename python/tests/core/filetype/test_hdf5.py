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

import tempfile

import pandas as pd
import pytest

from mirage.core.filetype.hdf5 import cat, cut, grep, head, stat, tail, wc


def _make_hdf5(num_rows: int = 100) -> bytes:
    df = pd.DataFrame({
        "name": [f"user{i}" for i in range(num_rows)],
        "score":
        list(range(num_rows)),
        "grade": ["A" if i % 2 == 0 else "B" for i in range(num_rows)],
    })
    with tempfile.NamedTemporaryFile(suffix=".h5", delete=False) as f:
        df.to_hdf(f.name, key="data", mode="w")
        tmp = f.name
    with open(tmp, "rb") as fh:
        return fh.read()


HDF5_BYTES = _make_hdf5()
SMALL_HDF5 = _make_hdf5(num_rows=5)


class TestCat:

    def test_cat_returns_preview(self):
        result = cat(HDF5_BYTES)
        text = result.decode()
        assert "user0" in text

    def test_cat_limits_preview_rows(self):
        result = cat(HDF5_BYTES, max_rows=5)
        text = result.decode()
        assert "user4" in text
        assert "user5" not in text


class TestHead:

    def test_head_custom_n(self):
        result = head(HDF5_BYTES, n=3)
        text = result.decode()
        assert "user2" in text
        assert "user3" not in text


class TestTail:

    def test_tail_custom_n(self):
        result = tail(HDF5_BYTES, n=3)
        text = result.decode()
        assert "user99" in text
        assert "user96" not in text


class TestWc:

    def test_wc_returns_row_count(self):
        assert wc(HDF5_BYTES) == 100


class TestStat:

    def test_stat_includes_row_count(self):
        result = stat(HDF5_BYTES)
        text = result.decode()
        assert "100" in text


class TestGrep:

    def test_grep_finds_matching_rows(self):
        result = grep(HDF5_BYTES, "user1")
        text = result.decode()
        assert "user1" in text


class TestCut:

    def test_cut_single_column(self):
        result = cut(HDF5_BYTES, columns=["name"])
        text = result.decode()
        assert "name" in text
        assert "score" not in text

    def test_cut_invalid_column(self):
        with pytest.raises(ValueError):
            cut(HDF5_BYTES, columns=["nonexistent"])
