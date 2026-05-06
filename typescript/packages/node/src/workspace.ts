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

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import {
  createShellParser,
  ExecuteResult,
  type ExecuteOptions,
  type ProvisionResult,
  type Resource,
  type ShellParser,
  Workspace as CoreWorkspace,
  type WorkspaceOptions,
} from '@struktoai/mirage-core'
import { nativeExec, type NativeExecOptions } from './native.ts'
import { FuseManager } from './workspace/fuse.ts'

const requireCjs = createRequire(import.meta.url)

let cachedParser: Promise<ShellParser> | null = null

function loadShellParser(): Promise<ShellParser> {
  if (cachedParser !== null) return cachedParser
  const enginePath = requireCjs.resolve('web-tree-sitter/web-tree-sitter.wasm')
  const grammarPath = requireCjs.resolve('tree-sitter-bash/tree-sitter-bash.wasm')
  cachedParser = createShellParser({
    engineWasm: readFileSync(enginePath),
    grammarWasm: readFileSync(grammarPath),
  })
  return cachedParser
}

export interface NodeWorkspaceOptions extends WorkspaceOptions {
  fuse?: boolean
  native?: boolean
}

export class Workspace extends CoreWorkspace {
  private readonly defaultNative: boolean
  private readonly autoFuseManager: FuseManager | null
  private fuseSetupPromise: Promise<void> | null = null

  constructor(resources: Record<string, Resource>, options: NodeWorkspaceOptions = {}) {
    super(resources, {
      ...options,
      shellParserFactory: options.shellParserFactory ?? loadShellParser,
    })
    this.defaultNative = options.native ?? false
    this.autoFuseManager = options.fuse === true ? new FuseManager() : null
    if (this.autoFuseManager !== null) {
      // Kick off mount eagerly; await inside execute() / close() so callers
      // don't need to await the constructor. Python mirrors this: fuse=True
      // runs setup() during __init__ and __enter__ just returns self.
      const fm = this.autoFuseManager
      this.fuseSetupPromise = fm.setup(this).then(() => undefined)
    }
  }

  private async ensureFuseReady(): Promise<void> {
    if (this.fuseSetupPromise !== null) {
      await this.fuseSetupPromise
      this.fuseSetupPromise = null
    }
  }

  override execute(
    command: string,
    options?: ExecuteOptions & { provision?: false | undefined },
  ): Promise<ExecuteResult>
  override execute(
    command: string,
    options: ExecuteOptions & { provision: true },
  ): Promise<ProvisionResult>
  override execute(
    command: string,
    options: ExecuteOptions,
  ): Promise<ExecuteResult | ProvisionResult>
  override async execute(
    command: string,
    options: ExecuteOptions = {},
  ): Promise<ExecuteResult | ProvisionResult> {
    await this.ensureFuseReady()
    const useNative = options.native ?? this.defaultNative
    if (useNative) {
      const mp = this.fuseMountpoint
      if (mp === null) {
        console.warn(
          'native=true requires FUSE. Install macFUSE (macOS) or libfuse (Linux) ' +
            'and set ws.setFuseMountpoint(). Falling back to virtual mode.',
        )
      } else if (this.ownsFuseMount) {
        // TODO(fuse-native-deadlock): Node is single-threaded — @zkochan/fuse-native's
        // napi callbacks share the same event loop as child_process.spawn. Running
        // nativeExec against a mount we own in this process deadlocks. Python avoids
        // this via a daemon threading.Thread for FUSE. Fix options: (a) run FUSE in
        // a worker_thread, (b) spawn a helper process to host the mount. Until then,
        // raise with a pointer to the workarounds instead of hanging the process.
        throw new Error(
          'native=true with a same-process FUSE mount would deadlock ' +
            '(Node single event loop). Workarounds:\n' +
            '  1. Mount FUSE in a helper process; call nativeExec from this process.\n' +
            '  2. Point nativeExec at a mountpoint created by another tool ' +
            '(then call ws.setFuseMountpoint(path) without using FuseManager).\n' +
            '  3. Use execute() without native=true (virtual executor is in-process safe).\n' +
            'See https://mirage.dev/typescript/limitations for details.',
        )
      } else {
        const opts: NativeExecOptions = { cwd: mp }
        if (options.signal !== undefined) opts.signal = options.signal
        const { stdout, stderr, exitCode } = await nativeExec(command, opts)
        return new ExecuteResult(stdout, stderr, exitCode)
      }
    }
    return super.execute(command, options)
  }

  override async close(): Promise<void> {
    await this.ensureFuseReady().catch(() => undefined)
    if (this.autoFuseManager !== null) {
      await this.autoFuseManager.close(this)
    }
    await super.close()
  }
}
