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

from mirage.core.gmail.date_query import date_dir_to_gmail_query


@pytest.mark.parametrize("name,expected", [
    ("2026-05-03", "after:2026/05/03 before:2026/05/04"),
    ("2026-12-31", "after:2026/12/31 before:2027/01/01"),
    ("2026-01-01", "after:2026/01/01 before:2026/01/02"),
])
def test_date_dir_to_gmail_query_translates(name, expected):
    assert date_dir_to_gmail_query(name) == expected


@pytest.mark.parametrize("name", [
    "",
    "2026-13-01",
    "2026-02-30",
    "2026-5-3",
    "2026",
    "not-a-date",
    "2026-05",
    "2026-05-03-extra",
])
def test_date_dir_to_gmail_query_rejects(name):
    assert date_dir_to_gmail_query(name) is None
