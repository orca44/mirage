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

from mirage import Workspace
from mirage.server.registry import WorkspaceEntry
from mirage.server.schemas import (MountSummary, SessionSummary,
                                   WorkspaceBrief, WorkspaceDetail,
                                   WorkspaceInternals)
from mirage.workspace.snapshot.utils import norm_mount_prefix

_AUTO_PREFIXES = {"/dev/"}
_DESCRIPTION_MAX = 120


def _is_auto_prefix(prefix: str, observer_prefix: str | None) -> bool:
    if prefix in _AUTO_PREFIXES:
        return True
    if observer_prefix and prefix == norm_mount_prefix(observer_prefix):
        return True
    return False


def _mount_description(resource) -> str:
    raw = getattr(resource, "PROMPT", "") or ""
    if len(raw) <= _DESCRIPTION_MAX:
        return raw
    return raw[:_DESCRIPTION_MAX - 1].rstrip() + "\u2026"


def _user_mounts(ws: Workspace):
    observer_prefix = ws.observer.prefix if ws.observer is not None else None
    return [
        m for m in ws._registry.mounts()
        if not _is_auto_prefix(m.prefix, observer_prefix)
    ]


def _build_internals(ws: Workspace) -> WorkspaceInternals:
    cache = ws._cache
    cache_bytes = sum(len(v) for v in cache._store.files.values())
    history_len = (len(ws.history.entries()) if ws.history is not None else 0)
    return WorkspaceInternals(
        cache_bytes=cache_bytes,
        cache_entries=len(cache._entries),
        history_length=history_len,
        in_flight_jobs=len(ws.job_table.list_jobs()),
    )


def make_brief(entry: WorkspaceEntry) -> WorkspaceBrief:
    ws = entry.runner.ws
    user_mounts = _user_mounts(ws)
    workspace_mode = (user_mounts[0].mode.value if user_mounts else "read")
    return WorkspaceBrief(
        id=entry.id,
        mode=workspace_mode,
        mount_count=len(user_mounts),
        session_count=len(ws.list_sessions()),
        created_at=entry.created_at,
    )


def make_detail(entry: WorkspaceEntry,
                verbose: bool = False) -> WorkspaceDetail:
    ws = entry.runner.ws
    user_mounts = _user_mounts(ws)
    workspace_mode = (user_mounts[0].mode.value if user_mounts else "read")
    mounts = [
        MountSummary(
            prefix=m.prefix,
            resource=m.resource.name,
            mode=m.mode.value,
            description=_mount_description(m.resource),
        ) for m in user_mounts
    ]
    sessions = [
        SessionSummary(session_id=s.session_id, cwd=s.cwd)
        for s in ws.list_sessions()
    ]
    return WorkspaceDetail(
        id=entry.id,
        mode=workspace_mode,
        created_at=entry.created_at,
        mounts=mounts,
        sessions=sessions,
        internals=_build_internals(ws) if verbose else None,
    )
