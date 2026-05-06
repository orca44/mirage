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

from mirage.core.github.scope import estimate_scope
from mirage.core.github.tree_entry import TreeEntry


@pytest.fixture
def tree():
    return {
        "src":
        TreeEntry(path="src", type="tree", sha="aaa", size=None),
        "src/main.py":
        TreeEntry(path="src/main.py", type="blob", sha="bbb", size=120),
        "src/utils.py":
        TreeEntry(path="src/utils.py", type="blob", sha="ccc", size=80),
        "src/data.json":
        TreeEntry(path="src/data.json", type="blob", sha="ddd", size=500),
        "README.md":
        TreeEntry(path="README.md", type="blob", sha="eee", size=50),
    }


@pytest.mark.asyncio
async def test_estimate_scope_all_files(tree):
    count, total = await estimate_scope(tree, "", "*")
    assert count == 4
    assert total == 750


@pytest.mark.asyncio
async def test_estimate_scope_pattern_filter(tree):
    count, total = await estimate_scope(tree, "src", "*.py")
    assert count == 2
    assert total == 200


@pytest.mark.asyncio
async def test_estimate_scope_specific_match(tree):
    count, total = await estimate_scope(tree, "src", "data.json")
    assert count == 1
    assert total == 500


@pytest.mark.asyncio
async def test_estimate_scope_empty_directory(tree):
    count, total = await estimate_scope(tree, "nonexistent", "*")
    assert count == 0
    assert total == 0
