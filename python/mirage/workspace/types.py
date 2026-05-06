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

from dataclasses import asdict, dataclass, field

from mirage.observe import OpRecord
from mirage.types import DEFAULT_SESSION_ID


@dataclass
class ExecutionNode:
    """A node in the execution tree capturing per-command stderr and exit code.

    Args:
        command (str | None): Leaf command string, None for operators.
        op (str | None): Operator ("|", ";", "&&", "||"), None for leaf nodes.
        stderr (bytes): This node's stderr output.
        exit_code (int): This node's exit code.
        children (list[ExecutionNode]): Child nodes (empty for leaf commands).
        records (list[OpRecord]): I/O operation records for this node.
    """

    command: str | None = None
    op: str | None = None
    stderr: bytes = b""
    exit_code: int = 0
    children: list["ExecutionNode"] = field(default_factory=list)
    records: list[OpRecord] = field(default_factory=list)

    def to_dict(self) -> dict:
        d: dict = {}
        if self.command is not None:
            d["command"] = self.command
        if self.op is not None:
            d["op"] = self.op
        d["stderr"] = self.stderr.decode(errors="replace")
        d["exit_code"] = self.exit_code
        if self.children:
            d["children"] = [c.to_dict() for c in self.children]
        if self.records:
            d["records"] = [asdict(r) for r in self.records]
        return d


@dataclass
class ExecutionRecord:
    """One history entry produced by each ws.execute() call.

    Args:
        agent (str): Identifier for who ran the command.
        command (str): The raw command string.
        stdout (bytes): Final output.
        stdin (bytes | None): Input fed to the first stage, if any.
        exit_code (int): Top-level exit code.
        tree (ExecutionNode): Structured execution tree.
        timestamp (float): When the command was executed.
        session_id (str): Session that ran the command.
    """

    agent: str
    command: str
    stdout: bytes
    stdin: bytes | None
    exit_code: int
    tree: ExecutionNode
    timestamp: float
    session_id: str = DEFAULT_SESSION_ID

    def to_dict(self) -> dict:
        return {
            "agent": self.agent,
            "command": self.command,
            "stdout": self.stdout.decode(errors="replace"),
            "stdin":
            self.stdin.decode(errors="replace") if self.stdin else None,
            "exit_code": self.exit_code,
            "tree": self.tree.to_dict(),
            "timestamp": self.timestamp,
            "session_id": self.session_id,
        }
