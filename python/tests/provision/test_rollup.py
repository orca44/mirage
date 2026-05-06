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
from mirage.provision.rollup import rollup_list, rollup_pipe


def test_rollup_pipe_sums():
    children = [
        ProvisionResult(network_read_low=100,
                        network_read_high=100,
                        read_ops=1),
        ProvisionResult(network_read_low=200,
                        network_read_high=200,
                        read_ops=2),
    ]
    result = rollup_pipe(children)
    assert result.op == "|"
    assert result.network_read_low == 300
    assert result.read_ops == 3
    assert result.precision == Precision.EXACT


def test_rollup_pipe_unknown_cascades():
    children = [
        ProvisionResult(precision=Precision.UNKNOWN),
        ProvisionResult(precision=Precision.EXACT),
    ]
    result = rollup_pipe(children)
    assert result.precision == Precision.UNKNOWN
    assert children[1].precision == Precision.UNKNOWN


def test_rollup_list_and_sums():
    children = [
        ProvisionResult(network_read_low=100, network_read_high=100),
        ProvisionResult(network_read_low=200, network_read_high=200),
    ]
    result = rollup_list("&&", children)
    assert result.network_read_low == 300


def test_rollup_list_or_uses_range():
    children = [
        ProvisionResult(network_read_low=100, network_read_high=100),
        ProvisionResult(network_read_low=200, network_read_high=200),
    ]
    result = rollup_list("||", children)
    assert result.network_read_low == 100
    assert result.network_read_high == 200
