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

import pytest

from mirage.core.google.date_glob import glob_to_modified_range


@pytest.mark.parametrize(
    "pattern,expected",
    [
        ("2026-*", ("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z")),
        ("2026-05-*", ("2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z")),
        ("2026-12-*", ("2026-12-01T00:00:00Z", "2027-01-01T00:00:00Z")),
        ("2026-05-03_*", ("2026-05-03T00:00:00Z", "2026-05-04T00:00:00Z")),
        ("2026-12-31_*", ("2026-12-31T00:00:00Z", "2027-01-01T00:00:00Z")),
    ],
)
def test_date_glob_translates(pattern, expected):
    assert glob_to_modified_range(pattern) == expected


@pytest.mark.parametrize(
    "pattern",
    [
        None,
        "",
        "*",
        "*.gdoc.json",
        "report-*",
        "2026",
        "20-*",
        "abc-2026-*",
        "2026-13-*",
        "2026-05-32_*",
        "2026-00-*",
        "2026-05-00_*",
    ],
)
def test_date_glob_no_match_returns_none(pattern):
    assert glob_to_modified_range(pattern) is None
