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

from mirage.provision import Precision, ProvisionResult


def test_leaf_dry_run_result():
    r = ProvisionResult(
        command="cat file.txt",
        network_read_low=100,
        network_read_high=100,
        read_ops=1,
    )
    assert r.op is None
    assert r.command == "cat file.txt"
    assert r.network_read_low == 100
    assert r.network_read_high == 100
    assert r.read_ops == 1
    assert r.cache_hits == 0
    assert r.precision == Precision.EXACT
    assert r.estimated_cost_usd is None
    assert r.children == []


def test_pipe_dry_run_result():
    r = ProvisionResult(
        op="|",
        network_read_low=100,
        network_read_high=100,
        children=[
            ProvisionResult(command="cat f.txt",
                            network_read_low=100,
                            network_read_high=100,
                            read_ops=1),
            ProvisionResult(command="grep x",
                            network_read_low=0,
                            network_read_high=0),
        ],
    )
    assert r.op == "|"
    assert len(r.children) == 2
    assert r.children[0].command == "cat f.txt"


def test_precision_enum():
    assert Precision.EXACT == "exact"
    assert Precision.RANGE == "range"
    assert Precision.UNKNOWN == "unknown"


def test_dry_run_result_serialization():
    r = ProvisionResult(
        op="&&",
        network_read_low=200,
        network_read_high=300,
        precision=Precision.RANGE,
        estimated_cost_usd=0.001,
        children=[
            ProvisionResult(command="cat a.txt",
                            network_read_low=100,
                            network_read_high=100),
            ProvisionResult(command="cat b.txt",
                            network_read_low=100,
                            network_read_high=200,
                            precision=Precision.RANGE),
        ],
    )
    d = r.model_dump()
    assert d["op"] == "&&"
    assert d["estimated_cost_usd"] == 0.001
    assert len(d["children"]) == 2
    roundtrip = ProvisionResult.model_validate(d)
    assert roundtrip == r
