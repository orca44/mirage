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

from mirage.shell.types import NodeType as NT
from mirage.workspace.expand import expand_node


async def expand_test_expr(node, session, execute_fn, cs, registry):
    """Expand test_command [ ... ] into a flat list of strings."""
    result = []
    for child in node.named_children:
        if child.type == NT.BINARY_EXPRESSION:
            for part in child.children:
                if part.type in ("=", "!=", "=="):
                    result.append(part.text.decode())
                elif part.is_named:
                    exp = await expand_node(part, session, execute_fn, cs)
                    result.append(exp)
        elif child.type == NT.UNARY_EXPRESSION:
            for part in child.children:
                if part.type == NT.TEST_OPERATOR:
                    result.append(part.text.decode())
                elif part.is_named:
                    exp = await expand_node(part, session, execute_fn, cs)
                    result.append(exp)
        elif child.type == NT.NEGATION_EXPRESSION:
            result.append("!")
            for part in child.named_children:
                sub = await _expand_inner(part, session, execute_fn, cs)
                result.extend(sub)
        else:
            exp = await expand_node(child, session, execute_fn, cs)
            result.append(exp)
    return result


async def _expand_inner(node, session, execute_fn, cs):
    """Expand a single test expression node into args."""
    result = []
    if node.type == NT.BINARY_EXPRESSION:
        for part in node.children:
            if part.type in ("=", "!=", "=="):
                result.append(part.text.decode())
            elif part.is_named:
                exp = await expand_node(part, session, execute_fn, cs)
                result.append(exp)
    elif node.type == NT.UNARY_EXPRESSION:
        for part in node.children:
            if part.type == NT.TEST_OPERATOR:
                result.append(part.text.decode())
            elif part.is_named:
                exp = await expand_node(part, session, execute_fn, cs)
                result.append(exp)
    else:
        exp = await expand_node(node, session, execute_fn, cs)
        result.append(exp)
    return result
