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

from mirage.observe.log_entry import LogEntry
from mirage.observe.record import OpRecord
from mirage.resource.base import BaseResource
from mirage.utils.dates import utc_date_folder


class Observer:
    """Persists LogEntry records to a resource as JSONL files.

    Args:
        resource (BaseResource): Storage backend for log files.
        prefix (str): Mount prefix for agent access.
    """

    def __init__(
        self,
        resource: BaseResource,
        prefix: str = "/.sessions",
    ) -> None:
        self._resource = resource
        self._prefix = prefix
        self._sessions: set[str] = set()

    @property
    def resource(self) -> BaseResource:
        return self._resource

    @property
    def prefix(self) -> str:
        return self._prefix

    @property
    def sessions(self) -> set[str]:
        return set(self._sessions)

    def _is_observer_path(self, path: str) -> bool:
        prefix = self._prefix.rstrip("/")
        return path == prefix or path.startswith(prefix + "/")

    async def log_op(
        self,
        rec: OpRecord,
        agent: str,
        session: str,
        cwd: str | None = None,
    ) -> None:
        """Persist an OpRecord as a JSONL line.

        Skips ops whose path targets the observer's own mount, so
        reading /.sessions/*.jsonl does not self-log and pollute the
        record stream.

        Args:
            rec (OpRecord): The operation record.
            agent (str): Agent ID.
            session (str): Session ID.
            cwd (str | None): Session cwd at log time.
        """
        if self._is_observer_path(rec.path):
            return
        entry = LogEntry.from_op_record(rec, agent, session, cwd)
        self._sessions.add(session)
        line = (entry.to_json_line() + "\n").encode()
        await self._append(f"/{utc_date_folder()}/{session}.jsonl", line)

    async def log_command(self, rec, cwd: str | None = None) -> None:
        """Persist an ExecutionRecord as a JSONL line.

        Args:
            rec (ExecutionRecord): The execution record.
            cwd (str | None): Session cwd at log time.
        """
        entry = LogEntry.from_execution_record(rec, cwd)
        self._sessions.add(rec.session_id)
        line = (entry.to_json_line() + "\n").encode()
        await self._append(f"/{utc_date_folder()}/{rec.session_id}.jsonl",
                           line)

    async def _append(self, path: str, data: bytes) -> None:
        store = self._resource._store
        key = path if path.startswith("/") else "/" + path
        last_slash = key.rfind("/")
        parent = "/" if last_slash <= 0 else key[:last_slash]
        store.dirs.add(parent)
        if key in store.files:
            store.files[key] += data
        else:
            store.files[key] = data
