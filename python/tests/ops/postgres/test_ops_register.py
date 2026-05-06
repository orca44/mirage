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

from mirage.ops.postgres import OPS
from mirage.ops.postgres.read import read
from mirage.ops.postgres.readdir import readdir
from mirage.ops.postgres.stat import stat


def test_ops_list_exports_three():
    assert len(OPS) == 3
    assert read in OPS
    assert readdir in OPS
    assert stat in OPS


def test_ops_have_registered_metadata():
    for fn in (read, readdir, stat):
        assert hasattr(fn, "_registered_ops")
        registered = fn._registered_ops
        assert len(registered) >= 1


def test_read_op_is_for_postgres_resource():
    registered = read._registered_ops[0]
    assert registered.resource == "postgres"
    assert registered.name == "read"


def test_readdir_op_is_for_postgres_resource():
    registered = readdir._registered_ops[0]
    assert registered.resource == "postgres"
    assert registered.name == "readdir"


def test_stat_op_is_for_postgres_resource():
    registered = stat._registered_ops[0]
    assert registered.resource == "postgres"
    assert registered.name == "stat"
