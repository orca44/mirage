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

import type { FileType, Implementation, Mount, MountType } from './types.ts'

export interface FileTypeFilter {
  filetypes: FileType[]
}

export type PosixOpSupport = boolean | FileTypeFilter

export interface FlagFilter {
  exclude?: string[]
  include?: string[]
  only?: string[]
}

export interface CommandCapability {
  filetypes?: FileType[]
  flags?: FlagFilter
}

export type CommandSupport = boolean | CommandCapability

export interface PosixCapabilities {
  read: PosixOpSupport
  readdir: boolean
  stat: boolean
  write: PosixOpSupport
  unlink: boolean
  mkdir: boolean
  rmdir: boolean
  rename: boolean
  glob: boolean
}

export interface CommandCapabilities {
  ls: CommandSupport
  cat: CommandSupport
  head: CommandSupport
  tail: CommandSupport
  wc: CommandSupport
  grep: CommandSupport
  find: CommandSupport
  jq: CommandSupport
  sed: CommandSupport
  cp: CommandSupport
  mv: CommandSupport
  [vendor: string]: CommandSupport
}

export interface WorkspaceCapabilities {
  snapshot: boolean
  load: boolean
  list: boolean
  delete: boolean
  info: boolean
}

export interface ServerCapabilities {
  posix: PosixCapabilities
  commands: CommandCapabilities
  workspace: WorkspaceCapabilities
  mounts: Mount[]
  _meta?: Record<string, unknown>
}

export interface CapabilityDeclaration {
  protocol_version: number
  implementation: Implementation
  capabilities: ServerCapabilities
}

export function emptyPosixCapabilities(): PosixCapabilities {
  return {
    read: false,
    readdir: false,
    stat: false,
    write: false,
    unlink: false,
    mkdir: false,
    rmdir: false,
    rename: false,
    glob: false,
  }
}

export function emptyCommandCapabilities(): CommandCapabilities {
  return {
    ls: false,
    cat: false,
    head: false,
    tail: false,
    wc: false,
    grep: false,
    find: false,
    jq: false,
    sed: false,
    cp: false,
    mv: false,
  } as CommandCapabilities
}

export function emptyWorkspaceCapabilities(): WorkspaceCapabilities {
  return { snapshot: false, load: false, list: false, delete: false, info: false }
}

export class CapabilityBuilder {
  mountType: MountType
  writable: boolean
  posix: PosixCapabilities
  commands: CommandCapabilities
  workspace: WorkspaceCapabilities

  constructor(mountType: MountType = 'filesystem', writable = false) {
    this.mountType = mountType
    this.writable = writable
    this.posix = emptyPosixCapabilities()
    this.commands = emptyCommandCapabilities()
    this.workspace = emptyWorkspaceCapabilities()
  }

  advertisedFiletypes(): FileType[] {
    const types = new Set<FileType>()
    for (const op of [this.posix.read, this.posix.write]) {
      if (op !== false && op !== true) {
        for (const t of op.filetypes) types.add(t)
      }
    }
    for (const key of Object.keys(this.commands)) {
      const cmd = this.commands[key]
      if (cmd && typeof cmd === 'object' && cmd.filetypes) {
        for (const t of cmd.filetypes) types.add(t)
      }
    }
    return Array.from(types).sort()
  }

  toMount(path: string): Mount {
    return {
      path,
      type: this.mountType,
      writable: this.writable,
      filetypes: this.advertisedFiletypes(),
    }
  }
}

export function mergePosix(into: PosixCapabilities, src: PosixCapabilities): PosixCapabilities {
  const target = into as unknown as Record<string, PosixOpSupport>
  for (const key of Object.keys(into) as (keyof PosixCapabilities)[]) {
    target[key] = mergeOpSupport(target[key] ?? false, src[key])
  }
  return into
}

function mergeOpSupport(a: PosixOpSupport, b: PosixOpSupport): PosixOpSupport {
  if (a === true || b === true) return true
  if (a === false) return b
  if (b === false) return a
  const merged = new Set<FileType>([...a.filetypes, ...b.filetypes])
  return { filetypes: Array.from(merged).sort() }
}

export function mergeCommands(
  into: CommandCapabilities,
  src: CommandCapabilities,
): CommandCapabilities {
  const keys = new Set<string>([...Object.keys(into), ...Object.keys(src)])
  for (const key of keys) {
    into[key] = mergeCommandSupport(into[key] ?? false, src[key] ?? false)
  }
  return into
}

function mergeCommandSupport(a: CommandSupport, b: CommandSupport): CommandSupport {
  if (a === true || b === true) return true
  if (a === false) return b
  if (b === false) return a
  const types = new Set<FileType>([...(a.filetypes ?? []), ...(b.filetypes ?? [])])
  const merged: CommandCapability = {}
  if (types.size) merged.filetypes = Array.from(types).sort()
  return merged
}
