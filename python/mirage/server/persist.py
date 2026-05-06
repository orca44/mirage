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
import logging
import time
from pathlib import Path
from typing import Any

import yaml

from mirage import Workspace
from mirage.config import _interpolate_env
from mirage.resource.registry import build_resource
from mirage.server.registry import WorkspaceRegistry
from mirage.workspace.snapshot.utils import norm_mount_prefix

logger = logging.getLogger(__name__)

INDEX_FILENAME = "index.json"


def _index_path(persist_dir: Path) -> Path:
    return persist_dir / INDEX_FILENAME


def _tar_path(persist_dir: Path, workspace_id: str) -> Path:
    return persist_dir / f"{workspace_id}.tar"


def _override_path(persist_dir: Path, workspace_id: str) -> Path:
    return persist_dir / f"{workspace_id}.override.yaml"


def _read_override(path: Path, env: dict[str, str]) -> dict[str, Any] | None:
    if not path.exists():
        return None
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError(f"override at {path} is not a mapping")
    return _interpolate_env(raw, env)


def _override_to_resources(override: dict[str, Any] | None) -> dict | None:
    if not override or "mounts" not in override:
        return None
    out: dict = {}
    for prefix, block in override["mounts"].items():
        if not isinstance(block, dict):
            continue
        resource_name = block.get("resource")
        config = block.get("config") or {}
        if resource_name is None:
            continue
        out[norm_mount_prefix(prefix)] = build_resource(resource_name, config)
    return out or None


async def snapshot_all(registry: WorkspaceRegistry, persist_dir: Path) -> int:
    """Snapshot every active workspace into ``persist_dir``.

    Writes ``<id>.tar`` per workspace plus a top-level ``index.json``
    mapping ids to tar paths and saved-at timestamps.

    Args:
        registry (WorkspaceRegistry): the live registry to dump.
        persist_dir (Path): destination directory; created if absent.

    Returns:
        int: number of workspaces successfully snapshotted.
    """
    persist_dir.mkdir(parents=True, exist_ok=True)
    index: dict[str, Any] = {"workspaces": {}}
    saved = 0
    for wid, entry in registry.items():
        try:
            target = _tar_path(persist_dir, wid)
            await entry.runner.call(_save_to_path(entry.runner.ws, target))
            index["workspaces"][wid] = {
                "tar": target.name,
                "saved_at": time.time(),
            }
            saved += 1
        except Exception:
            logger.exception("failed to snapshot workspace %s", wid)
    _index_path(persist_dir).write_text(json.dumps(index, indent=2),
                                        encoding="utf-8")
    return saved


async def _save_to_path(ws: Workspace, target: Path) -> None:
    ws.snapshot(str(target))


def restore_all(registry: WorkspaceRegistry,
                persist_dir: Path,
                env: dict[str, str] | None = None) -> tuple[int, int]:
    """Rehydrate workspaces from a previous ``snapshot_all`` dump.

    Args:
        registry (WorkspaceRegistry): empty registry to populate.
        persist_dir (Path): source directory written by ``snapshot_all``.
        env (dict[str, str] | None): env mapping for ``${VAR}``
            interpolation in any ``<id>.override.yaml`` sidecars.
            Defaults to ``os.environ``.

    Returns:
        tuple[int, int]: ``(restored, skipped)`` -- count of
            workspaces restored vs failed-and-skipped.
    """
    if env is None:
        import os
        env = dict(os.environ)
    index_file = _index_path(persist_dir)
    if not index_file.exists():
        return 0, 0
    try:
        index = json.loads(index_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        logger.exception("persist_dir index.json is corrupt; skipping restore")
        return 0, 0
    restored = 0
    skipped = 0
    for wid, info in index.get("workspaces", {}).items():
        try:
            tar = persist_dir / info["tar"]
            override = _read_override(_override_path(persist_dir, wid), env)
            resources = _override_to_resources(override)
            ws = Workspace.load(str(tar), resources=resources)
            registry.add(ws, workspace_id=wid)
            restored += 1
        except Exception:
            logger.exception("failed to restore workspace %s; skipping", wid)
            skipped += 1
    return restored, skipped
