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

import json
import time

from mirage.observe import LogEntry, OpRecord
from mirage.workspace.types import ExecutionNode, ExecutionRecord


def test_from_op_record():
    rec = OpRecord(
        op="read",
        path="/data/file.csv",
        source="s3",
        bytes=1024,
        timestamp=1712145600000,
        duration_ms=45,
    )
    entry = LogEntry.from_op_record(rec, agent="agent-1", session="sess-1")
    assert entry.type == "op"
    assert entry.agent == "agent-1"
    assert entry.session == "sess-1"
    assert entry.op == "read"
    assert entry.path == "/data/file.csv"
    assert entry.source == "s3"
    assert entry.bytes == 1024
    assert entry.duration_ms == 45


def test_from_execution_record():
    rec = ExecutionRecord(
        agent="agent-1",
        command="grep foo /data/bar",
        stdout=b"matched line\n",
        stdin=None,
        exit_code=0,
        tree=ExecutionNode(command="grep foo /data/bar"),
        timestamp=time.time(),
        session_id="sess-1",
    )
    entry = LogEntry.from_execution_record(rec)
    assert entry.type == "command"
    assert entry.agent == "agent-1"
    assert entry.session == "sess-1"
    assert entry.command == "grep foo /data/bar"
    assert entry.exit_code == 0


def test_to_json_line_op():
    rec = OpRecord(
        op="read",
        path="/f.csv",
        source="s3",
        bytes=100,
        timestamp=1000,
        duration_ms=5,
    )
    entry = LogEntry.from_op_record(rec, agent="a", session="s")
    line = entry.to_json_line()
    parsed = json.loads(line)
    assert parsed["type"] == "op"
    assert parsed["agent"] == "a"
    assert parsed["op"] == "read"
    assert "command" not in parsed


def test_to_json_line_command():
    rec = ExecutionRecord(
        agent="a",
        command="ls",
        stdout=b"out",
        stdin=None,
        exit_code=0,
        tree=ExecutionNode(command="ls"),
        timestamp=1.0,
        session_id="s",
    )
    entry = LogEntry.from_execution_record(rec)
    line = entry.to_json_line()
    parsed = json.loads(line)
    assert parsed["type"] == "command"
    assert parsed["command"] == "ls"
    assert "op" not in parsed


def test_log_entry_includes_cwd_for_op():
    rec = OpRecord(
        op="read",
        path="/f.csv",
        source="s3",
        bytes=100,
        timestamp=1000,
        duration_ms=5,
    )
    entry = LogEntry.from_op_record(rec, agent="a", session="s", cwd="/data")
    parsed = json.loads(entry.to_json_line())
    assert parsed["cwd"] == "/data"


def test_log_entry_includes_cwd_for_command():
    rec = ExecutionRecord(
        agent="a",
        command="ls",
        stdout=b"out",
        stdin=None,
        exit_code=0,
        tree=ExecutionNode(command="ls"),
        timestamp=1.0,
        session_id="s",
    )
    entry = LogEntry.from_execution_record(rec, cwd="/data")
    parsed = json.loads(entry.to_json_line())
    assert parsed["cwd"] == "/data"


def test_log_entry_omits_cwd_when_not_provided():
    rec = OpRecord(
        op="read",
        path="/f.csv",
        source="s3",
        bytes=100,
        timestamp=1000,
        duration_ms=5,
    )
    entry = LogEntry.from_op_record(rec, agent="a", session="s")
    parsed = json.loads(entry.to_json_line())
    assert "cwd" not in parsed
