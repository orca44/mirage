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

from mirage.commands.builtin.utils.types import _ReadBytes


def wc(
    read_bytes: _ReadBytes,
    path: str,
    lines_only: bool = False,
    words_only: bool = False,
    bytes_only: bool = False,
    chars_only: bool = False,
    max_line_length: bool = False,
) -> dict[str, int] | int:
    data = read_bytes(path)
    text = data.decode(errors="replace")
    line_count = text.count("\n")
    word_count = len(text.split())
    byte_count = len(data)
    if max_line_length:
        return max((len(line) for line in text.splitlines()), default=0)
    if lines_only:
        return line_count
    if words_only:
        return word_count
    if chars_only:
        return len(text)
    if bytes_only:
        return byte_count
    return {"lines": line_count, "words": word_count, "bytes": byte_count}
