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

from mirage.ops.github import OPS


def test_ops_contains_read():
    fns = {fn.__name__ for fn in OPS}
    assert "read" in fns


def test_ops_contains_stat():
    fns = {fn.__name__ for fn in OPS}
    assert "stat" in fns


def test_ops_contains_readdir():
    fns = {fn.__name__ for fn in OPS}
    assert "readdir" in fns


def test_ops_has_three_entries():
    assert len(OPS) == 3


def test_no_write_ops():
    write_ops = {
        "write", "mkdir", "unlink", "rmdir", "rename", "create", "truncate"
    }
    fns = {fn.__name__ for fn in OPS}
    assert not write_ops.intersection(fns)
