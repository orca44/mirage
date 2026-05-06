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

import type { RAMResourceState } from '../resource/ram/ram.ts'

export const SNAPSHOT_FORMAT_VERSION = 1

export interface ResourceStateBase {
  type: string
  needsOverride?: boolean
}

export type ResourceState = RAMResourceState | (ResourceStateBase & Record<string, unknown>)

export interface MountSnapshot {
  index: number
  prefix: string
  mode: string
  resourceClass: string
  resourceState: ResourceState
}

export interface CacheEntrySnapshot {
  key: string
  data: Uint8Array
  fingerprint: string | null
  ttl: number | null
  cachedAt: number
  size: number
}

export interface CacheSnapshot {
  limit: number
  entries: CacheEntrySnapshot[]
}

export interface ExecutionNodeSnapshot {
  command: string | null
  op: string | null
  stderr: Uint8Array
  exitCode: number
  children: ExecutionNodeSnapshot[]
}

export interface ExecutionRecordSnapshot {
  agent: string
  command: string
  stdout: Uint8Array
  stdin: Uint8Array | null
  exitCode: number
  tree: ExecutionNodeSnapshot
  timestamp: number
  sessionId: string
}

export interface WorkspaceStateDict {
  version: number
  mounts: MountSnapshot[]
  cache: CacheSnapshot
  history: ExecutionRecordSnapshot[]
}
