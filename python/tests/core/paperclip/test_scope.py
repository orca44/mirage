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

from mirage.core.paperclip.scope import detect_scope
from mirage.types import PathSpec


def test_root_empty_string():
    result = detect_scope("")
    assert result.level == "root"
    assert result.source is None


def test_root_slash():
    result = detect_scope("/")
    assert result.level == "root"


def test_root_pathspec_with_prefix():
    path = PathSpec(original="/paperclip/",
                    directory="/paperclip/",
                    prefix="/paperclip")
    result = detect_scope(path)
    assert result.level == "root"


def test_source_level():
    result = detect_scope("biorxiv")
    assert result.level == "source"
    assert result.source == "biorxiv"


def test_source_level_medrxiv():
    result = detect_scope("medrxiv")
    assert result.level == "source"
    assert result.source == "medrxiv"


def test_source_level_with_prefix():
    path = PathSpec(original="/paperclip/biorxiv",
                    directory="/paperclip/biorxiv",
                    prefix="/paperclip")
    result = detect_scope(path)
    assert result.level == "source"
    assert result.source == "biorxiv"


def test_year_level():
    result = detect_scope("biorxiv/2024")
    assert result.level == "year"
    assert result.source == "biorxiv"
    assert result.year == "2024"


def test_year_level_with_prefix():
    path = PathSpec(original="/paperclip/biorxiv/2024",
                    directory="/paperclip/biorxiv/2024",
                    prefix="/paperclip")
    result = detect_scope(path)
    assert result.level == "year"
    assert result.source == "biorxiv"
    assert result.year == "2024"


def test_month_level():
    result = detect_scope("biorxiv/2024/03")
    assert result.level == "month"
    assert result.source == "biorxiv"
    assert result.year == "2024"
    assert result.month == "03"


def test_month_level_with_prefix():
    path = PathSpec(original="/paperclip/pmc/2023/11",
                    directory="/paperclip/pmc/2023/11",
                    prefix="/paperclip")
    result = detect_scope(path)
    assert result.level == "month"
    assert result.source == "pmc"
    assert result.year == "2023"
    assert result.month == "11"


def test_paper_level():
    result = detect_scope("biorxiv/2024/03/bio_07cb291a7ce4")
    assert result.level == "paper"
    assert result.source == "biorxiv"
    assert result.year == "2024"
    assert result.month == "03"
    assert result.paper_id == "bio_07cb291a7ce4"


def test_file_level():
    result = detect_scope("biorxiv/2024/03/bio_07cb291a7ce4/content.lines")
    assert result.level == "file"
    assert result.source == "biorxiv"
    assert result.paper_id == "bio_07cb291a7ce4"


def test_file_level_with_prefix():
    path = PathSpec(
        original="/paperclip/biorxiv/2024/03/bio_xxx/content.lines",
        directory="/paperclip/biorxiv/2024/03/bio_xxx",
        prefix="/paperclip",
    )
    result = detect_scope(path)
    assert result.level == "file"
    assert result.source == "biorxiv"
    assert result.paper_id == "bio_xxx"


def test_unknown_source_returns_file():
    result = detect_scope("unknown_source/2024")
    assert result.level == "file"


def test_invalid_year_returns_file():
    result = detect_scope("biorxiv/1999")
    assert result.level == "file"
