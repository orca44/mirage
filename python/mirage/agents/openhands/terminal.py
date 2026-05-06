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

import functools
from typing import TYPE_CHECKING, Any

from openhands.sdk.llm import TextContent
from openhands.sdk.tool import ToolExecutor, register_tool
from openhands.tools.terminal import TerminalTool
from openhands.tools.terminal.definition import (TerminalAction,
                                                 TerminalObservation)
from openhands.tools.terminal.metadata import CmdOutputMetadata

from mirage.agents.openhands.workspace import MirageWorkspace

if TYPE_CHECKING:
    from openhands.sdk.conversation.impl.local_conversation import \
        LocalConversation


class MirageTerminalExecutor(ToolExecutor[TerminalAction,
                                          TerminalObservation]):
    """Routes OpenHands TerminalTool actions through a Mirage Workspace.

    Args:
        workspace: MirageWorkspace adapter wrapping a Mirage Workspace.
            Each TerminalAction is executed via
            ``workspace.execute_command``, which dispatches the shell
            command through Mirage's accessor stack so virtual mounts
            (S3, Slack, ...) appear as paths.
    """

    def __init__(self, workspace: MirageWorkspace) -> None:
        self._mw = workspace

    def __call__(
        self,
        action: TerminalAction,
        conversation: "LocalConversation | None" = None,
    ) -> TerminalObservation:
        if action.is_input:
            return TerminalObservation(
                command=action.command,
                content=[
                    TextContent(text=("MirageTerminalExecutor does not "
                                      "support is_input=True"))
                ],
                exit_code=-1,
                metadata=CmdOutputMetadata(exit_code=-1,
                                           working_dir=self._mw.working_dir),
            )
        timeout = action.timeout if action.timeout is not None else 30.0
        result = self._mw.execute_command(action.command, timeout=timeout)
        text = (result.stdout or "") + (result.stderr or "")
        metadata = CmdOutputMetadata(
            exit_code=result.exit_code,
            working_dir=self._mw.working_dir,
        )
        return TerminalObservation(
            command=action.command,
            content=[TextContent(text=text)],
            exit_code=result.exit_code,
            timeout=result.timeout_occurred,
            metadata=metadata,
        )


def _mirage_terminal_factory(
    workspace: MirageWorkspace,
    *,
    conv_state: Any,
    **params: Any,
) -> list[TerminalTool]:
    executor = MirageTerminalExecutor(workspace)
    return list(
        TerminalTool.create(conv_state=conv_state, executor=executor,
                            **params))


def register_mirage_terminal(
    workspace: MirageWorkspace,
    name: str = "mirage_terminal",
) -> str:
    """Register a TerminalTool variant routed through Mirage.

    Args:
        workspace: MirageWorkspace adapter to bind to the executor.
        name: Tool name to register under. Defaults to
            "mirage_terminal".

    Returns:
        str: The registered tool name, ready to use as
        ``Tool(name=...)`` in the agent's tool list.
    """
    register_tool(name, functools.partial(_mirage_terminal_factory, workspace))
    return name
