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

from mirage.core.paperclip.parsing import (MONTH_NAMES, parse_ls_entries,
                                           parse_paper_ids,
                                           parse_search_results,
                                           parse_sql_rows, sql_id_to_fs_id,
                                           uuid_to_fs_id)

SEARCH_OUTPUT = """\
  1. CRISPR base editing in vivo
     Author A, Author B
     bio_abc123 · bioRxiv · 2024-03-15

  2. AAV delivery optimization
     Author C
     PMC789 · PMC · 2024-03-20
"""

LS_OUTPUT = ("meta.json  content.lines  (1271 lines)"
             "  sections/  supplements/  figures/\n"
             "  (read-only — use /.gxl/ for writable storage)")

SQL_OUTPUT = """\
id                                   | pub_date
-------------------------------------+---------------
fb37af04-6c0e-1014-9fac-9ce395c656a4 | September_2019
fb38c6a3-771e-1014-9681-9dd49822ec48 | January_2025
(2 rows, 14ms) [bioRxiv (2 rows) + PMC (0 rows)]
"""


def test_parse_paper_ids():
    ids = parse_paper_ids(SEARCH_OUTPUT)
    assert ids == ["bio_abc123", "PMC789"]


def test_parse_paper_ids_empty():
    assert parse_paper_ids("") == []
    assert parse_paper_ids("No results found.") == []
    assert parse_paper_ids("\n\n") == []


def test_parse_ls_entries():
    entries = parse_ls_entries(LS_OUTPUT)
    assert entries == [
        "meta.json",
        "content.lines",
        "sections",
        "supplements",
        "figures",
    ]


def test_parse_search_results():
    results = parse_search_results(SEARCH_OUTPUT)
    assert len(results) == 2
    assert results[0] == {
        "id": "bio_abc123",
        "source": "bioRxiv",
        "date": "2024-03-15",
    }
    assert results[1] == {
        "id": "PMC789",
        "source": "PMC",
        "date": "2024-03-20",
    }


def test_uuid_to_fs_id():
    uuid = "07cb291a-7ce4-1014-92f1-84c9b6e67765"
    assert uuid_to_fs_id(uuid, "bioRxiv") == "bio_07cb291a7ce4"
    assert uuid_to_fs_id(uuid, "medRxiv") == "med_07cb291a7ce4"


def test_sql_id_to_fs_id():
    uuid = "fb37af04-6c0e-1014-9fac-9ce395c656a4"
    assert sql_id_to_fs_id(uuid, "bioRxiv") == "bio_fb37af046c0e"
    assert sql_id_to_fs_id(uuid, "medRxiv") == "med_fb37af046c0e"
    assert sql_id_to_fs_id("PMC9969233", "PMC") == "PMC9969233"


def test_parse_sql_rows():
    rows = parse_sql_rows(SQL_OUTPUT)
    assert len(rows) == 2
    assert rows[0] == {
        "id": "fb37af04-6c0e-1014-9fac-9ce395c656a4",
        "pub_date": "September_2019",
    }
    assert rows[1] == {
        "id": "fb38c6a3-771e-1014-9681-9dd49822ec48",
        "pub_date": "January_2025",
    }


def test_month_names():
    assert MONTH_NAMES["01"] == "January"
    assert MONTH_NAMES["06"] == "June"
    assert MONTH_NAMES["12"] == "December"
    assert len(MONTH_NAMES) == 12
