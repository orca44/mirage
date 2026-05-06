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

from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field

from mirage.vfp.capability import CapabilityDeclaration
from mirage.vfp.types import Entry, FileStat, Implementation, SnapshotInfo


class _Msg(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    meta: dict[str, Any] = Field(default_factory=dict, alias="_meta")


class InitializeRequest(_Msg):
    METHOD: ClassVar[str] = "initialize"

    protocol_version: int = 1
    client_info: Implementation | None = None


class InitializeResponse(_Msg):
    METHOD: ClassVar[str] = "initialize"

    protocol_version: int
    server_info: Implementation
    capabilities: CapabilityDeclaration


class FsReadRequest(_Msg):
    METHOD: ClassVar[str] = "fs/read"

    path: str


class FsReadResponse(_Msg):
    METHOD: ClassVar[str] = "fs/read"

    bytes: bytes


class FsReaddirRequest(_Msg):
    METHOD: ClassVar[str] = "fs/readdir"

    path: str


class FsReaddirResponse(_Msg):
    METHOD: ClassVar[str] = "fs/readdir"

    entries: list[Entry]


class FsStatRequest(_Msg):
    METHOD: ClassVar[str] = "fs/stat"

    path: str


class FsStatResponse(_Msg):
    METHOD: ClassVar[str] = "fs/stat"

    stat: FileStat


class FsWriteRequest(_Msg):
    METHOD: ClassVar[str] = "fs/write"

    path: str
    bytes: bytes


class FsWriteResponse(_Msg):
    METHOD: ClassVar[str] = "fs/write"


class FsUnlinkRequest(_Msg):
    METHOD: ClassVar[str] = "fs/unlink"

    path: str


class FsUnlinkResponse(_Msg):
    METHOD: ClassVar[str] = "fs/unlink"


class FsMkdirRequest(_Msg):
    METHOD: ClassVar[str] = "fs/mkdir"

    path: str


class FsMkdirResponse(_Msg):
    METHOD: ClassVar[str] = "fs/mkdir"


class FsRmdirRequest(_Msg):
    METHOD: ClassVar[str] = "fs/rmdir"

    path: str


class FsRmdirResponse(_Msg):
    METHOD: ClassVar[str] = "fs/rmdir"


class FsRenameRequest(_Msg):
    METHOD: ClassVar[str] = "fs/rename"

    src: str
    dst: str


class FsRenameResponse(_Msg):
    METHOD: ClassVar[str] = "fs/rename"


class FsGlobRequest(_Msg):
    METHOD: ClassVar[str] = "fs/glob"

    pattern: str


class FsGlobResponse(_Msg):
    METHOD: ClassVar[str] = "fs/glob"

    paths: list[str]


class CommandExecRequest(_Msg):
    METHOD: ClassVar[str] = "command/exec"

    name: str
    argv: list[str] = Field(default_factory=list)
    stdin: bytes | None = None
    cwd: str | None = None


class CommandExecResponse(_Msg):
    METHOD: ClassVar[str] = "command/exec"

    stdout: bytes
    stderr: bytes
    exit_code: int


class WorkspaceSnapshotRequest(_Msg):
    METHOD: ClassVar[str] = "workspace/snapshot"

    name: str | None = None
    description: str | None = None


class WorkspaceSnapshotResponse(_Msg):
    METHOD: ClassVar[str] = "workspace/snapshot"

    snapshot: SnapshotInfo


class WorkspaceLoadRequest(_Msg):
    METHOD: ClassVar[str] = "workspace/load"

    id: str


class WorkspaceLoadResponse(_Msg):
    METHOD: ClassVar[str] = "workspace/load"

    snapshot: SnapshotInfo


class WorkspaceListRequest(_Msg):
    METHOD: ClassVar[str] = "workspace/list"

    limit: int | None = None
    offset: int = 0


class WorkspaceListResponse(_Msg):
    METHOD: ClassVar[str] = "workspace/list"

    snapshots: list[SnapshotInfo]


class WorkspaceDeleteRequest(_Msg):
    METHOD: ClassVar[str] = "workspace/delete"

    id: str


class WorkspaceDeleteResponse(_Msg):
    METHOD: ClassVar[str] = "workspace/delete"

    deleted: bool


class WorkspaceInfoRequest(_Msg):
    METHOD: ClassVar[str] = "workspace/info"


class WorkspaceInfoResponse(_Msg):
    METHOD: ClassVar[str] = "workspace/info"

    workspace_id: str
    current_snapshot_id: str | None
    capabilities: CapabilityDeclaration


METHODS: dict[str, tuple[type[_Msg], type[_Msg]]] = {
    InitializeRequest.METHOD: (InitializeRequest, InitializeResponse),
    FsReadRequest.METHOD: (FsReadRequest, FsReadResponse),
    FsReaddirRequest.METHOD: (FsReaddirRequest, FsReaddirResponse),
    FsStatRequest.METHOD: (FsStatRequest, FsStatResponse),
    FsWriteRequest.METHOD: (FsWriteRequest, FsWriteResponse),
    FsUnlinkRequest.METHOD: (FsUnlinkRequest, FsUnlinkResponse),
    FsMkdirRequest.METHOD: (FsMkdirRequest, FsMkdirResponse),
    FsRmdirRequest.METHOD: (FsRmdirRequest, FsRmdirResponse),
    FsRenameRequest.METHOD: (FsRenameRequest, FsRenameResponse),
    FsGlobRequest.METHOD: (FsGlobRequest, FsGlobResponse),
    CommandExecRequest.METHOD: (CommandExecRequest, CommandExecResponse),
    WorkspaceSnapshotRequest.METHOD: (
        WorkspaceSnapshotRequest,
        WorkspaceSnapshotResponse,
    ),
    WorkspaceLoadRequest.METHOD: (WorkspaceLoadRequest, WorkspaceLoadResponse),
    WorkspaceListRequest.METHOD: (WorkspaceListRequest, WorkspaceListResponse),
    WorkspaceDeleteRequest.METHOD:
    (WorkspaceDeleteRequest, WorkspaceDeleteResponse),
    WorkspaceInfoRequest.METHOD: (WorkspaceInfoRequest, WorkspaceInfoResponse),
}

MethodName = Literal[
    "initialize",
    "fs/read",
    "fs/readdir",
    "fs/stat",
    "fs/write",
    "fs/unlink",
    "fs/mkdir",
    "fs/rmdir",
    "fs/rename",
    "fs/glob",
    "command/exec",
    "workspace/snapshot",
    "workspace/load",
    "workspace/list",
    "workspace/delete",
    "workspace/info",
]
