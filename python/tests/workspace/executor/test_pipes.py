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

import pytest

from mirage.io import IOResult
from mirage.io.types import materialize
from mirage.workspace.executor.pipes import handle_pipe
from mirage.workspace.session import Session
from mirage.workspace.types import ExecutionNode


class FakeNode:

    def __init__(self, text: str):
        self.text = text


@pytest.mark.asyncio
async def test_handle_pipe_passes_empty_stdin_when_left_returns_none():
    calls: list[dict] = []

    async def execute_node(nd, _session, stdin, _call_stack=None):
        stdin_was_none = stdin is None
        materialized = await materialize(stdin)
        calls.append({
            "text": nd.text,
            "stdin_was_none": stdin_was_none,
            "stdin_bytes": materialized,
        })
        if nd.text == "left":
            return (None, IOResult(stderr=b"boom", exit_code=1),
                    ExecutionNode(command=nd.text, exit_code=1))
        return (b"right-out", IOResult(exit_code=0),
                ExecutionNode(command=nd.text, exit_code=0))

    await handle_pipe(
        execute_node,
        [FakeNode("left"), FakeNode("right")],
        [False],
        Session(session_id="t"),
        None,
    )
    right = next(c for c in calls if c["text"] == "right")
    assert right["stdin_was_none"] is False
    assert right["stdin_bytes"] == b""


@pytest.mark.asyncio
async def test_handle_pipe_threads_stdout_to_next_stdin():
    seen: list[bytes] = []

    async def execute_node(nd, _session, stdin, _call_stack=None):
        seen.append(await materialize(stdin))
        return (f"{nd.text}-out".encode(), IOResult(exit_code=0),
                ExecutionNode(command=nd.text, exit_code=0))

    await handle_pipe(
        execute_node,
        [FakeNode("a"), FakeNode("b")],
        [False],
        Session(session_id="t"),
        None,
    )
    assert seen[0] == b""
    assert seen[1] == b"a-out"
