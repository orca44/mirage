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

_SEPARATOR = b"--\n"


def grep_context_lines(
    lines: list[str],
    pat: re.Pattern[str],
    invert: bool,
    line_numbers: bool,
    max_count: int | None,
    after_context: int,
    before_context: int,
) -> list[bytes]:
    total = len(lines)
    match_indices: list[int] = []
    for idx, line in enumerate(lines):
        hit = bool(pat.search(line))
        if invert:
            hit = not hit
        if hit:
            match_indices.append(idx)
            if max_count and len(match_indices) >= max_count:
                break

    if not match_indices:
        return []

    printed: set[int] = set()
    groups: list[list[int]] = []
    current_group: list[int] = []

    for mi in match_indices:
        start = max(0, mi - before_context)
        end = min(total - 1, mi + after_context)
        line_range = list(range(start, end + 1))
        if current_group and line_range[0] <= current_group[-1] + 1:
            for ln in line_range:
                if ln not in printed:
                    current_group.append(ln)
                    printed.add(ln)
        else:
            if current_group:
                groups.append(current_group)
            current_group = []
            for ln in line_range:
                printed.add(ln)
                current_group.append(ln)
    if current_group:
        groups.append(current_group)

    match_set = set(match_indices)
    result: list[bytes] = []
    for gi, group in enumerate(groups):
        if gi > 0:
            result.append(_SEPARATOR)
        for ln in group:
            line = lines[ln]
            if line_numbers:
                sep = ":" if ln in match_set else "-"
                result.append(f"{ln + 1}{sep}{line}\n".encode())
            else:
                result.append(f"{line}\n".encode())
    return result
