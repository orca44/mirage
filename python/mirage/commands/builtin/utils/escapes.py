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

_ESCAPE_MAP = {
    "\\n": "\n",
    "\\t": "\t",
    "\\r": "\r",
    "\\a": "\a",
    "\\b": "\b",
    "\\f": "\f",
    "\\v": "\v",
    "\\\\": "\\",
}

_ESCAPE_RE = re.compile(r"\\[ntrabfv\\]")


def interpret_escapes(text: str) -> str:
    """Interpret C-style backslash escape sequences in *text*.

    Args:
        text (str): The input string potentially containing escape sequences.

    Returns:
        str: The string with escape sequences replaced by their
            actual characters.
    """
    return _ESCAPE_RE.sub(lambda m: _ESCAPE_MAP[m.group()], text)
