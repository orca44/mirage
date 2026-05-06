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

from collections.abc import Callable

import tree_sitter

from mirage.shell.call_stack import CallStack
from mirage.shell.types import NodeType as NT
from mirage.types import PathSpec
from mirage.workspace.expand.classify import classify_word
from mirage.workspace.expand.node import expand_node
from mirage.workspace.mount import MountRegistry
from mirage.workspace.session import Session


def _has_at_expansion(node: tree_sitter.Node) -> bool:
    for child in node.children:
        if (child.type == NT.SIMPLE_EXPANSION and child.text.decode() == "$@"):
            return True
    return False


def _get_positional_args(session: Session,
                         call_stack: CallStack | None) -> list[str]:
    if call_stack and call_stack.get_all_positional():
        return call_stack.get_all_positional()
    return getattr(session, "positional_args", None) or []


_SPLIT_TYPES = frozenset({
    NT.SIMPLE_EXPANSION,
    NT.EXPANSION,
})


async def expand_parts(
    parts: list,
    session: Session,
    execute_fn: Callable,
    call_stack: CallStack | None = None,
) -> list[str]:
    """Expand a list of tree-sitter child nodes to strings."""
    result = []
    for p in parts:
        if p.type == NT.STRING and _has_at_expansion(p):
            positional = _get_positional_args(session, call_stack)
            if positional:
                result.extend(positional)
                continue
        expanded = await expand_node(p, session, execute_fn, call_stack)
        if p.type == NT.COMMAND_SUBSTITUTION:
            for word in expanded.split():
                if word:
                    result.append(word)
            continue
        elif p.type in _SPLIT_TYPES:
            for word in expanded.split():
                if word:
                    result.append(word)
        else:
            if expanded:
                result.append(expanded)
    return result


async def expand_and_classify(
    words: list,
    session: Session,
    execute_fn: Callable,
    registry: MountRegistry,
    cwd: str,
    call_stack: CallStack | None = None,
) -> list[str | PathSpec]:
    """Expand words, classify as PathSpec or text.

    Used by for/select where concrete values are needed
    before iteration.
    """
    expanded = await expand_parts(words, session, execute_fn, call_stack)
    return [classify_word(w, registry, cwd) for w in expanded]
