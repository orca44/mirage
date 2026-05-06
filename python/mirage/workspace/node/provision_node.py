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

from functools import partial
from typing import Any, Callable

from mirage.provision import Precision, ProvisionResult
from mirage.shell.helpers import (get_case_items, get_command_name,
                                  get_for_parts, get_if_branches,
                                  get_list_parts, get_negated_command,
                                  get_parts, get_pipeline_commands,
                                  get_redirect_parts, get_subshell_body,
                                  get_text, get_while_parts)
from mirage.shell.types import NodeType as NT
from mirage.shell.types import ShellBuiltin as SB
from mirage.workspace.expand import (classify_parts, expand_and_classify,
                                     expand_parts)
from mirage.workspace.mount import MountRegistry
from mirage.workspace.provision.builtins import handle_builtin_provision
from mirage.workspace.provision.command import handle_command_provision
from mirage.workspace.provision.control import (handle_for_provision,
                                                handle_if_provision,
                                                handle_while_provision)
from mirage.workspace.provision.pipes import (handle_connection_provision,
                                              handle_pipe_provision)
from mirage.workspace.provision.redirect import handle_redirect_provision
from mirage.workspace.provision.rollup import rollup_list
from mirage.workspace.session import Session

_BUILTIN_NAMES = frozenset({
    SB.CD,
    SB.TRUE,
    SB.FALSE,
    SB.SOURCE,
    SB.DOT,
    SB.EVAL,
    SB.EXPORT,
    SB.UNSET,
    SB.LOCAL,
    SB.PRINTENV,
    SB.READ,
    SB.SET,
    SB.SHIFT,
    SB.TRAP,
    SB.TEST,
    SB.BRACKET,
    SB.DOUBLE_BRACKET,
    SB.WAIT,
    SB.FG,
    SB.KILL,
    SB.JOBS,
    SB.PS,
    SB.ECHO,
    SB.PRINTF,
    SB.SLEEP,
    "return",
    "break",
    "continue",
})


async def provision_node(
    registry: MountRegistry,
    dispatch: Callable,
    execute_fn: Callable,
    node: Any,
    session: Session,
) -> ProvisionResult:
    """Walk tree-sitter AST and estimate execution cost.

    Args:
        registry (MountRegistry): mount registry for path resolution.
        dispatch (Callable): VFS op dispatcher.
        execute_fn (Callable): workspace.execute for $(cmd) expansion.
        node (Any): tree-sitter node.
        session (Session): shell session state.
    """
    recurse = partial(provision_node, registry, dispatch, execute_fn)
    ntype = node.type

    if ntype == "program":
        children = []
        for child in node.named_children:
            children.append(await recurse(child, session))
        if not children:
            return ProvisionResult(precision=Precision.EXACT)
        return rollup_list(";", children)

    if ntype == NT.COMMAND:
        name = get_command_name(node)
        if name in _BUILTIN_NAMES:
            return await handle_builtin_provision()
        parts = get_parts(node)
        expanded = await expand_parts(parts, session, execute_fn)
        classified = classify_parts(expanded, registry, session.cwd)
        return await handle_command_provision(registry, classified, session)

    if ntype == NT.PIPELINE:
        commands, _ = get_pipeline_commands(node)
        return await handle_pipe_provision(recurse, commands, session)

    if ntype == NT.LIST:
        left, op, right = get_list_parts(node)
        return await handle_connection_provision(recurse, left, op, right,
                                                 session)

    if ntype == NT.REDIRECTED_STATEMENT:
        command, _, _, _ = get_redirect_parts(node)
        return await handle_redirect_provision(recurse, command, session)

    if ntype == NT.SUBSHELL:
        body = get_subshell_body(node)
        children = []
        for child in body:
            children.append(await recurse(child, session))
        if not children:
            return ProvisionResult(precision=Precision.EXACT)
        return rollup_list(";", children)

    if ntype == NT.IF_STATEMENT:
        branches, else_body = get_if_branches(node)
        return await handle_if_provision(recurse, branches, else_body, session)

    if ntype == NT.FOR_STATEMENT:
        _, values, body = get_for_parts(node)
        classified = await expand_and_classify(values, session, execute_fn,
                                               registry, session.cwd)
        n = len(classified) or 1
        return await handle_for_provision(recurse, body, n, session)

    if ntype == NT.WHILE_STATEMENT:
        _, body = get_while_parts(node)
        return await handle_while_provision(recurse, body, session)

    if ntype == NT.CASE_STATEMENT:
        items = get_case_items(node)
        children = []
        for _, body in items:
            if body is not None:
                children.append(await recurse(body, session))
        if children:
            return rollup_list("||", children)
        return ProvisionResult(precision=Precision.EXACT)

    if ntype == NT.FUNCTION_DEFINITION:
        return await handle_builtin_provision()

    if ntype == NT.DECLARATION_COMMAND:
        return await handle_builtin_provision()

    if ntype == NT.UNSET_COMMAND:
        return await handle_builtin_provision()

    if ntype == NT.TEST_COMMAND:
        return await handle_builtin_provision()

    if ntype == NT.NEGATED_COMMAND:
        inner = get_negated_command(node)
        return await recurse(inner, session)

    if ntype == NT.VARIABLE_ASSIGNMENT:
        return await handle_builtin_provision()

    if ntype == NT.COMPOUND_STATEMENT:
        children = []
        for child in node.named_children:
            children.append(await recurse(child, session))
        if not children:
            return ProvisionResult(precision=Precision.EXACT)
        return rollup_list(";", children)

    return ProvisionResult(command=get_text(node), precision=Precision.UNKNOWN)
