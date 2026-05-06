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

import difflib
import re

from mirage.commands.builtin.utils.types import _ReadBytes


def _ed_script(a_lines: list[str], b_lines: list[str]) -> list[str]:
    sm = difflib.SequenceMatcher(None, a_lines, b_lines)
    edits: list[str] = []
    for tag, i1, i2, j1, j2 in reversed(sm.get_opcodes()):
        if tag == "equal":
            continue
        if tag == "delete":
            addr = f"{i1 + 1},{i2}" if i2 - i1 > 1 else f"{i1 + 1}"
            edits.append(f"{addr}d\n")
        elif tag == "insert":
            edits.append(f"{i1}a\n")
            for line in b_lines[j1:j2]:
                edits.append(line if line.endswith("\n") else line + "\n")
            edits.append(".\n")
        elif tag == "replace":
            addr = f"{i1 + 1},{i2}" if i2 - i1 > 1 else f"{i1 + 1}"
            edits.append(f"{addr}c\n")
            for line in b_lines[j1:j2]:
                edits.append(line if line.endswith("\n") else line + "\n")
            edits.append(".\n")
    return edits


def diff(
    read_bytes: _ReadBytes,
    path_a: str,
    path_b: str,
    ignore_case: bool = False,
    ignore_whitespace: bool = False,
    ignore_space_change: bool = False,
    ed_script: bool = False,
) -> list[str]:
    text_a = read_bytes(path_a).decode(errors="replace")
    text_b = read_bytes(path_b).decode(errors="replace")
    if ignore_case:
        text_a = text_a.lower()
        text_b = text_b.lower()
    if ignore_whitespace:
        text_a = re.sub(r"\s+", "", text_a)
        text_b = re.sub(r"\s+", "", text_b)
    if ignore_space_change:
        text_a = re.sub(r"[ \t]+", " ", text_a)
        text_b = re.sub(r"[ \t]+", " ", text_b)
    a_lines = text_a.splitlines(keepends=True)
    b_lines = text_b.splitlines(keepends=True)
    if ed_script:
        return _ed_script(a_lines, b_lines)
    return list(
        difflib.unified_diff(a_lines, b_lines, fromfile=path_a, tofile=path_b))
