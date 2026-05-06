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


def rollup_pipe(children: list[ProvisionResult]) -> ProvisionResult:
    """Aggregate plan results for a pipe (all run)."""
    unknown_seen = False
    for child in children:
        if unknown_seen:
            child.precision = Precision.UNKNOWN
        elif child.precision == Precision.UNKNOWN:
            unknown_seen = True

    precision = _precision(children)
    cost = _cost(children)

    return ProvisionResult(
        op="|",
        children=children,
        network_read_low=sum(c.network_read_low for c in children),
        network_read_high=sum(c.network_read_high for c in children),
        cache_read_low=sum(c.cache_read_low for c in children),
        cache_read_high=sum(c.cache_read_high for c in children),
        network_write_low=sum(c.network_write_low for c in children),
        network_write_high=sum(c.network_write_high for c in children),
        cache_write_low=sum(c.cache_write_low for c in children),
        cache_write_high=sum(c.cache_write_high for c in children),
        read_ops=sum(c.read_ops for c in children),
        cache_hits=sum(c.cache_hits for c in children),
        precision=precision,
        estimated_cost_usd=cost,
    )


def rollup_list(
    op: str,
    children: list[ProvisionResult],
) -> ProvisionResult:
    """Aggregate plan results for ;, &&, ||."""
    precision = _precision(children)
    cost = _cost(children)

    if op == "||":
        if cost is not None:
            cost_vals = [
                c.estimated_cost_usd for c in children
                if c.estimated_cost_usd is not None
            ]
            cost = min(cost_vals) if cost_vals else None
        return ProvisionResult(
            op=op,
            children=children,
            network_read_low=min((c.network_read_low for c in children),
                                 default=0),
            network_read_high=max((c.network_read_high for c in children),
                                  default=0),
            cache_read_low=min((c.cache_read_low for c in children),
                               default=0),
            cache_read_high=max((c.cache_read_high for c in children),
                                default=0),
            network_write_low=min((c.network_write_low for c in children),
                                  default=0),
            network_write_high=max((c.network_write_high for c in children),
                                   default=0),
            cache_write_low=min((c.cache_write_low for c in children),
                                default=0),
            cache_write_high=max((c.cache_write_high for c in children),
                                 default=0),
            read_ops=min((c.read_ops for c in children), default=0),
            cache_hits=min((c.cache_hits for c in children), default=0),
            precision=(Precision.RANGE if precision != Precision.UNKNOWN else
                       Precision.UNKNOWN),
            estimated_cost_usd=cost,
        )

    return ProvisionResult(
        op=op,
        children=children,
        network_read_low=sum(c.network_read_low for c in children),
        network_read_high=sum(c.network_read_high for c in children),
        cache_read_low=sum(c.cache_read_low for c in children),
        cache_read_high=sum(c.cache_read_high for c in children),
        network_write_low=sum(c.network_write_low for c in children),
        network_write_high=sum(c.network_write_high for c in children),
        cache_write_low=sum(c.cache_write_low for c in children),
        cache_write_high=sum(c.cache_write_high for c in children),
        read_ops=sum(c.read_ops for c in children),
        cache_hits=sum(c.cache_hits for c in children),
        precision=precision,
        estimated_cost_usd=cost,
    )


def _precision(children: list[ProvisionResult], ) -> Precision:
    has_unknown = any(c.precision == Precision.UNKNOWN for c in children)
    has_range = any(c.precision == Precision.RANGE for c in children)
    if has_unknown:
        return Precision.UNKNOWN
    if has_range:
        return Precision.RANGE
    return Precision.EXACT


def _cost(children: list[ProvisionResult], ) -> float | None:
    all_costs = [
        c.estimated_cost_usd for c in children
        if c.estimated_cost_usd is not None
    ]
    if len(all_costs) == len(children) and children:
        return sum(all_costs)
    return None
