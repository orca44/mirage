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

import asyncio

import pytest

from mirage.resource.ram import RAMResource
from mirage.shell.parse import find_syntax_error, parse
from mirage.workspace import Workspace


@pytest.mark.parametrize("bad_cmd", [
    "if then fi",
    "echo (",
    "for x do done",
    "for",
    "if",
    "if; fi",
    'echo "unterm',
])
def test_find_syntax_error_detects_error_nodes(bad_cmd):
    ast = parse(bad_cmd)
    snippet = find_syntax_error(ast)
    assert snippet is not None, (
        f"expected syntax error for {bad_cmd!r}, got None")


@pytest.mark.parametrize("good_cmd", [
    "echo hi",
    "for x in a b; do echo $x; done",
    "if true; then echo y; fi",
    "cat /tmp/x | sort",
])
def test_find_syntax_error_returns_none_for_valid(good_cmd):
    assert find_syntax_error(parse(good_cmd)) is None


@pytest.mark.parametrize("bad_cmd", [
    "if then fi",
    "echo (",
    "for x do done",
])
def test_execute_returns_clear_syntax_error(bad_cmd):
    ws = Workspace({"/data": RAMResource()})
    io = asyncio.run(ws.execute(bad_cmd))
    assert io.exit_code == 2, (
        f"expected exit 2 for {bad_cmd!r}, got {io.exit_code}")
    stderr = io.stderr or b""
    assert b"syntax error" in stderr, (
        f"expected 'syntax error' in stderr for {bad_cmd!r}, got {stderr!r}")
