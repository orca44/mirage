// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2026 @ Strukto.AI All Rights Reserved. =========

import type { CapabilityDeclaration } from './capability.ts'
import type { Entry, FileStat, Implementation, SnapshotInfo } from './types.ts'

interface BaseMsg {
  _meta?: Record<string, unknown>
}

export interface InitializeRequest extends BaseMsg {
  protocol_version: number
  client_info?: Implementation
}
export interface InitializeResponse extends BaseMsg {
  protocol_version: number
  server_info: Implementation
  capabilities: CapabilityDeclaration
}

export interface FsReadRequest extends BaseMsg {
  path: string
}
export interface FsReadResponse extends BaseMsg {
  bytes: Uint8Array
}

export interface FsReaddirRequest extends BaseMsg {
  path: string
}
export interface FsReaddirResponse extends BaseMsg {
  entries: Entry[]
}

export interface FsStatRequest extends BaseMsg {
  path: string
}
export interface FsStatResponse extends BaseMsg {
  stat: FileStat
}

export interface FsWriteRequest extends BaseMsg {
  path: string
  bytes: Uint8Array
}
export type FsWriteResponse = BaseMsg

export interface FsUnlinkRequest extends BaseMsg {
  path: string
}
export type FsUnlinkResponse = BaseMsg

export interface FsMkdirRequest extends BaseMsg {
  path: string
}
export type FsMkdirResponse = BaseMsg

export interface FsRmdirRequest extends BaseMsg {
  path: string
}
export type FsRmdirResponse = BaseMsg

export interface FsRenameRequest extends BaseMsg {
  src: string
  dst: string
}
export type FsRenameResponse = BaseMsg

export interface FsGlobRequest extends BaseMsg {
  pattern: string
}
export interface FsGlobResponse extends BaseMsg {
  paths: string[]
}

export interface CommandExecRequest extends BaseMsg {
  name: string
  argv?: string[]
  stdin?: Uint8Array
  cwd?: string
}
export interface CommandExecResponse extends BaseMsg {
  stdout: Uint8Array
  stderr: Uint8Array
  exit_code: number
}

export interface WorkspaceSnapshotRequest extends BaseMsg {
  name?: string
  description?: string
}
export interface WorkspaceSnapshotResponse extends BaseMsg {
  snapshot: SnapshotInfo
}

export interface WorkspaceLoadRequest extends BaseMsg {
  id: string
}
export interface WorkspaceLoadResponse extends BaseMsg {
  snapshot: SnapshotInfo
}

export interface WorkspaceListRequest extends BaseMsg {
  limit?: number
  offset?: number
}
export interface WorkspaceListResponse extends BaseMsg {
  snapshots: SnapshotInfo[]
}

export interface WorkspaceDeleteRequest extends BaseMsg {
  id: string
}
export interface WorkspaceDeleteResponse extends BaseMsg {
  deleted: boolean
}

export type WorkspaceInfoRequest = BaseMsg
export interface WorkspaceInfoResponse extends BaseMsg {
  workspace_id: string
  current_snapshot_id: string | null
  capabilities: CapabilityDeclaration
}

export const Methods = Object.freeze({
  INITIALIZE: 'initialize',
  FS_READ: 'fs/read',
  FS_READDIR: 'fs/readdir',
  FS_STAT: 'fs/stat',
  FS_WRITE: 'fs/write',
  FS_UNLINK: 'fs/unlink',
  FS_MKDIR: 'fs/mkdir',
  FS_RMDIR: 'fs/rmdir',
  FS_RENAME: 'fs/rename',
  FS_GLOB: 'fs/glob',
  COMMAND_EXEC: 'command/exec',
  WORKSPACE_SNAPSHOT: 'workspace/snapshot',
  WORKSPACE_LOAD: 'workspace/load',
  WORKSPACE_LIST: 'workspace/list',
  WORKSPACE_DELETE: 'workspace/delete',
  WORKSPACE_INFO: 'workspace/info',
} as const)

export type MethodName = (typeof Methods)[keyof typeof Methods]
