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

from mirage.shell.call_stack import CallStack
from mirage.shell.types import NodeType as NT
from mirage.workspace.session import Session


def _lookup_var(var: str, session: Session,
                call_stack: CallStack | None) -> str:
    env = session.env
    last_exit_code = session.last_exit_code
    positional = getattr(session, "positional_args", None)
    if var in ("@", "*"):
        if call_stack and call_stack.get_all_positional():
            return " ".join(call_stack.get_all_positional())
        if positional:
            return " ".join(positional)
        return ""
    if var == "#":
        if call_stack and call_stack.get_all_positional():
            return str(call_stack.get_positional_count())
        if positional:
            return str(len(positional))
        return "0"
    if var == "?":
        return str(last_exit_code)
    if var.isdigit():
        idx = int(var)
        if idx == 0:
            return "mirage"
        if call_stack and call_stack.get_positional(idx):
            return call_stack.get_positional(idx)
        if positional and 0 < idx <= len(positional):
            return positional[idx - 1]
        return ""
    if call_stack:
        local_val = call_stack.get_local(var)
        if local_val is not None:
            return local_val
    return env.get(var, "")


def _expand_braces(node, env: dict, call_stack: CallStack | None) -> str:
    """Expand ${VAR}, ${VAR:-default}, etc."""
    var_name = None
    default_val = None
    for c in node.named_children:
        if c.type == NT.VARIABLE_NAME:
            var_name = c.text.decode()
        elif c.type in (NT.WORD, NT.STRING, NT.RAW_STRING, NT.STRING_CONTENT):
            default_val = c.text.decode()
    val = ""
    if var_name:
        if call_stack:
            local_val = call_stack.get_local(var_name)
            if local_val is not None:
                val = local_val
        if not val:
            val = env.get(var_name, "")
    if default_val is not None and not val:
        return default_val
    return val
