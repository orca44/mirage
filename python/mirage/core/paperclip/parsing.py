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

import re

MONTH_NAMES: dict[str, str] = {
    "01": "January",
    "02": "February",
    "03": "March",
    "04": "April",
    "05": "May",
    "06": "June",
    "07": "July",
    "08": "August",
    "09": "September",
    "10": "October",
    "11": "November",
    "12": "December",
}

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
_SEARCH_ID_RE = re.compile(r"^\s+(\S+)\s+·\s+(\S+)\s+·\s+(\S+)")
_PARENS_RE = re.compile(r"\([^)]*\)")


def strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences from text.

    Args:
        text (str): text possibly containing ANSI codes.

    Returns:
        str: clean text.
    """
    return _ANSI_RE.sub("", text)


def uuid_to_fs_id(uuid: str, source: str) -> str:
    """Convert a SQL UUID to a filesystem ID.

    Args:
        uuid (str): UUID string like '07cb291a-7ce4-1014-92f1-84c9b6e67765'.
        source (str): Source name like 'bioRxiv' or 'medRxiv'.

    Returns:
        str: Filesystem ID like 'bio_07cb291a7ce4'.
    """
    hex_chars = uuid.replace("-", "")[:12]
    if source.lower().startswith("med"):
        return f"med_{hex_chars}"
    return f"bio_{hex_chars}"


def sql_id_to_fs_id(sql_id: str, source: str) -> str:
    """Convert a SQL row ID to a filesystem ID.

    Args:
        sql_id (str): UUID, arxiv id ('2509.23768'), or PMC id ('PMC9969233').
        source (str): Source name like 'arxiv', 'bioRxiv', 'medRxiv', or 'PMC'.

    Returns:
        str: Filesystem ID.
    """
    if source.upper() == "PMC":
        return sql_id
    if source.lower() == "arxiv":
        return f"arx_{sql_id}"
    return uuid_to_fs_id(sql_id, source)


def parse_paper_ids(output: str) -> list[str]:
    """Parse paper IDs from search output.

    Args:
        output (str): Raw text output from a search command.

    Returns:
        list[str]: List of paper ID strings.
    """
    ids: list[str] = []
    clean = strip_ansi(output)
    for line in clean.splitlines():
        m = _SEARCH_ID_RE.match(line)
        if m:
            ids.append(m.group(1))
    return ids


def parse_search_results(output: str) -> list[dict]:
    """Parse search output into structured results.

    Args:
        output (str): Raw text output from a search command.

    Returns:
        list[dict]: List of dicts with 'id', 'source', and 'date' keys.
    """
    results: list[dict] = []
    clean = strip_ansi(output)
    for line in clean.splitlines():
        m = _SEARCH_ID_RE.match(line)
        if m:
            results.append({
                "id": m.group(1),
                "source": m.group(2),
                "date": m.group(3),
            })
    return results


def parse_ls_entries(output: str) -> list[str]:
    """Parse ls output into a list of entry names.

    Args:
        output (str): Raw text output from an ls command.

    Returns:
        list[str]: List of entry names with trailing slashes stripped.
    """
    entries: list[str] = []
    clean = strip_ansi(output)
    for line in clean.splitlines():
        stripped = line.strip()
        if stripped.startswith("("):
            continue
        cleaned = _PARENS_RE.sub("", stripped)
        for token in cleaned.split():
            entries.append(token.rstrip("/"))
    return entries


def parse_sql_rows(output: str) -> list[dict]:
    """Parse pipe-separated SQL output into a list of dicts.

    Args:
        output (str): Raw text output from a SQL query.

    Returns:
        list[dict]: List of dicts keyed by column headers.
    """
    lines = output.splitlines()
    rows: list[dict] = []
    headers: list[str] = []
    header_found = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("("):
            continue
        if not header_found and "|" in stripped:
            headers = [h.strip() for h in stripped.split("|")]
            header_found = True
            continue
        if header_found and re.match(r"^[-+\s]+$", stripped):
            continue
        if header_found and "|" in stripped:
            values = [v.strip() for v in stripped.split("|")]
            rows.append(dict(zip(headers, values)))

    return rows
