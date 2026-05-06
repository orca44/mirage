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

import io
import json
from typing import Annotated, Any

from fastapi import (APIRouter, File, Form, HTTPException, Query, Request,
                     UploadFile)
from fastapi.responses import Response

from mirage import Workspace
from mirage.resource.registry import build_resource
from mirage.server.clone import clone_workspace_with_override
from mirage.server.schemas import (CloneWorkspaceRequest,
                                   CreateWorkspaceRequest,
                                   DeleteWorkspaceResponse, WorkspaceBrief,
                                   WorkspaceDetail)
from mirage.server.summary import make_brief, make_detail
from mirage.workspace.snapshot.utils import norm_mount_prefix

router = APIRouter(prefix="/v1/workspaces")


@router.post("", response_model=WorkspaceDetail, status_code=201)
async def create_workspace(req: CreateWorkspaceRequest,
                           request: Request) -> WorkspaceDetail:
    registry = request.app.state.registry
    if req.id is not None and req.id in registry:
        raise HTTPException(status_code=409,
                            detail=f"workspace id already exists: {req.id!r}")
    kwargs = req.config.to_workspace_kwargs()
    ws = Workspace(**kwargs)
    try:
        entry = registry.add(ws, workspace_id=req.id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return make_detail(entry)


@router.get("", response_model=list[WorkspaceBrief])
async def list_workspaces(request: Request) -> list[WorkspaceBrief]:
    return [make_brief(e) for e in request.app.state.registry.list()]


@router.get("/{workspace_id}", response_model=WorkspaceDetail)
async def get_workspace(
    workspace_id: str, request: Request, verbose: bool = Query(False)
) -> WorkspaceDetail:  # noqa: E125
    registry = request.app.state.registry
    if workspace_id not in registry:
        raise HTTPException(status_code=404, detail="workspace not found")
    return make_detail(registry.get(workspace_id), verbose=verbose)


@router.delete("/{workspace_id}", response_model=DeleteWorkspaceResponse)
async def delete_workspace(workspace_id: str,
                           request: Request) -> DeleteWorkspaceResponse:
    import time
    registry = request.app.state.registry
    if workspace_id not in registry:
        raise HTTPException(status_code=404, detail="workspace not found")
    await registry.remove(workspace_id)
    return DeleteWorkspaceResponse(id=workspace_id, closed_at=time.time())


@router.post("/{workspace_id}/clone",
             response_model=WorkspaceDetail,
             status_code=201)
async def clone_workspace(workspace_id: str, req: CloneWorkspaceRequest,
                          request: Request) -> WorkspaceDetail:
    registry = request.app.state.registry
    if workspace_id not in registry:
        raise HTTPException(status_code=404, detail="workspace not found")
    if req.id is not None and req.id in registry:
        raise HTTPException(status_code=409,
                            detail=f"workspace id already exists: {req.id!r}")
    src_entry = registry.get(workspace_id)
    new_ws = await src_entry.runner.call(
        clone_workspace_with_override(src_entry.runner.ws, req.override))
    try:
        entry = registry.add(new_ws, workspace_id=req.id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return make_detail(entry)


@router.get("/{workspace_id}/snapshot")
async def snapshot_workspace(workspace_id: str, request: Request) -> Response:
    registry = request.app.state.registry
    if workspace_id not in registry:
        raise HTTPException(status_code=404, detail="workspace not found")
    entry = registry.get(workspace_id)
    buf = io.BytesIO()
    await entry.runner.call(_run_snapshot(entry.runner.ws, buf))
    body = buf.getvalue()
    return Response(
        content=body,
        media_type="application/x-tar",
        headers={
            "Content-Disposition":
            f'attachment; filename="{workspace_id}.tar"',
        },
    )


async def _run_snapshot(ws: Workspace, buf: io.BytesIO) -> None:
    ws.snapshot(buf)


@router.post("/load", response_model=WorkspaceDetail, status_code=201)
async def load_workspace(
    request: Request,
    tar: Annotated[UploadFile, File()],
    override: Annotated[str | None, Form()] = None,
    workspace_id: Annotated[str | None, Form(alias="id")] = None,
) -> WorkspaceDetail:
    registry = request.app.state.registry
    if workspace_id is not None and workspace_id in registry:
        raise HTTPException(
            status_code=409,
            detail=f"workspace id already exists: {workspace_id!r}")
    raw = await tar.read()
    override_data: dict[str, Any] | None = None
    if override:
        try:
            override_data = json.loads(override)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400,
                                detail=f"override must be JSON: {e}")
    resources = _build_load_resources(override_data)
    try:
        ws = Workspace.load(io.BytesIO(raw), resources=resources)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        entry = registry.add(ws, workspace_id=workspace_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return make_detail(entry)


def _build_load_resources(override: dict[str, Any] | None) -> dict | None:
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
