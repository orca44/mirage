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

import asyncio
import json
import time

from mirage.observe import OpRecord
from mirage.observe.observer import Observer
from mirage.resource.ram import RAMResource
from mirage.utils.dates import utc_date_folder
from mirage.workspace.types import ExecutionNode, ExecutionRecord


def test_log_op_writes_jsonl():
    resource = RAMResource()
    obs = Observer(resource=resource)
    rec = OpRecord(
        op="read",
        path="/data/f.csv",
        source="s3",
        bytes=100,
        timestamp=1000,
        duration_ms=5,
    )
    asyncio.run(obs.log_op(rec, agent="agent-1", session="sess-1"))
    data = resource._store.files[f"/{utc_date_folder()}/sess-1.jsonl"]
    parsed = json.loads(data.decode().strip())
    assert parsed["type"] == "op"
    assert parsed["agent"] == "agent-1"
    assert parsed["session"] == "sess-1"
    assert parsed["op"] == "read"


def test_log_command_writes_jsonl():
    resource = RAMResource()
    obs = Observer(resource=resource)
    rec = ExecutionRecord(
        agent="agent-1",
        command="ls /data",
        stdout=b"file.csv\n",
        stdin=None,
        exit_code=0,
        tree=ExecutionNode(command="ls /data"),
        timestamp=time.time(),
        session_id="sess-1",
    )
    asyncio.run(obs.log_command(rec))
    data = resource._store.files[f"/{utc_date_folder()}/sess-1.jsonl"]
    parsed = json.loads(data.decode().strip())
    assert parsed["type"] == "command"
    assert parsed["session"] == "sess-1"
    assert parsed["command"] == "ls /data"


def test_multiple_entries_appended():
    resource = RAMResource()
    obs = Observer(resource=resource)
    for i in range(3):
        rec = OpRecord(
            op="read",
            path=f"/f{i}",
            source="s3",
            bytes=i,
            timestamp=1000 + i,
            duration_ms=1,
        )
        asyncio.run(obs.log_op(rec, agent="a", session="s"))
    data = resource._store.files[f"/{utc_date_folder()}/s.jsonl"]
    lines = data.decode().strip().split("\n")
    assert len(lines) == 3


def test_observer_prefix():
    resource = RAMResource()
    obs = Observer(resource=resource, prefix="/audit")
    assert obs.prefix == "/audit"


def test_observer_sessions_tracked():
    resource = RAMResource()
    obs = Observer(resource=resource)
    rec = OpRecord(
        op="stat",
        path="/f",
        source="ram",
        bytes=0,
        timestamp=1000,
        duration_ms=1,
    )
    asyncio.run(obs.log_op(rec, agent="a", session="sess-1"))
    asyncio.run(obs.log_op(rec, agent="a", session="sess-2"))
    assert obs.sessions == {"sess-1", "sess-2"}
