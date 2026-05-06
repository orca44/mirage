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

from mirage.io.types import IOResult
from mirage.workspace.workspace import Workspace


def _decode(value: bytes | None) -> str:
    if value is None:
        return ""
    return value.decode("utf-8", errors="replace")


def _io_to_str(io: IOResult) -> str:
    stdout = _decode(io.stdout)
    stderr = _decode(io.stderr)
    if stderr:
        return f"{stdout}\n{stderr}" if stdout else stderr
    return stdout


class MirageShellExecutor:
    """ShellTool executor backed by a Mirage Workspace.

    Args:
        workspace (Workspace): The workspace to execute commands in.
    """

    def __init__(self, workspace: Workspace) -> None:
        self._ws = workspace

    async def __call__(self, request) -> str:
        commands = request.data.action.commands
        outputs: list[str] = []
        for cmd in commands:
            io = await self._ws.execute(cmd)
            outputs.append(_io_to_str(io))
        return "\n".join(outputs)
