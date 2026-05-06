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

import { rmSync } from 'node:fs'
import type { Workspace } from '@struktoai/mirage-core'
import { forceUnmount, mount, type FuseHandle, type MountOptions } from '../fuse/mount.ts'

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
type Signal = (typeof SIGNALS)[number]

/**
 * Tracks auto-mounted FUSE handles and installs a single process-wide cleanup
 * path on SIGINT / SIGTERM / SIGHUP / `process.exit` so the kernel never ends
 * up with a stale mountpoint after the node process dies. Mirrors Python's
 * KeyboardInterrupt → `diskutil unmount force` / `fusermount -u` in mount.py.
 */
class FuseCleanupRegistry {
  private readonly mounts = new Set<{ mountpoint: string; handle: FuseHandle }>()
  private installed = false
  private exiting = false

  register(entry: { mountpoint: string; handle: FuseHandle }): void {
    this.mounts.add(entry)
    this.install()
  }

  unregister(entry: { mountpoint: string; handle: FuseHandle }): void {
    this.mounts.delete(entry)
  }

  private install(): void {
    if (this.installed) return
    this.installed = true
    for (const sig of SIGNALS) {
      process.on(sig, this.onSignal)
    }
    process.on('beforeExit', this.onExit)
    process.on('exit', this.onExit)
  }

  private readonly onSignal = (sig: Signal): void => {
    if (this.exiting) return
    this.exiting = true
    this.drainSync()
    // Re-raise the signal so the default termination action runs after we've
    // unmounted. Node suppresses the default when a listener is attached.
    process.kill(process.pid, sig)
  }

  private readonly onExit = (): void => {
    if (this.exiting) return
    this.exiting = true
    this.drainSync()
  }

  private drainSync(): void {
    for (const entry of this.mounts) {
      forceUnmount(entry.mountpoint)
      try {
        rmSync(entry.mountpoint, { recursive: true, force: true })
      } catch {
        // best-effort
      }
    }
    this.mounts.clear()
  }
}

const CLEANUP = new FuseCleanupRegistry()

export class FuseManager {
  private handle: FuseHandle | null = null
  private externalMountpoint: string | null = null
  private auto = false
  private cleanupEntry: { mountpoint: string; handle: FuseHandle } | null = null

  get mountpoint(): string | null {
    if (this.handle !== null) return this.handle.mountpoint
    return this.externalMountpoint
  }

  set mountpoint(path: string | null) {
    this.externalMountpoint = path
  }

  async setup(ws: Workspace, options: MountOptions = {}): Promise<string> {
    if (this.handle !== null) return this.handle.mountpoint
    this.handle = await mount(ws, options)
    this.auto = true
    this.externalMountpoint = null
    this.cleanupEntry = { mountpoint: this.handle.mountpoint, handle: this.handle }
    CLEANUP.register(this.cleanupEntry)
    ws.setFuseMountpoint(this.handle.mountpoint, { owned: true })
    return this.handle.mountpoint
  }

  async unmount(ws?: Workspace): Promise<void> {
    if (this.handle === null) {
      if (ws !== undefined) ws.setFuseMountpoint(null)
      this.externalMountpoint = null
      return
    }
    const mp = this.handle.mountpoint
    try {
      await this.handle.unmount()
    } finally {
      if (this.cleanupEntry !== null) {
        CLEANUP.unregister(this.cleanupEntry)
        this.cleanupEntry = null
      }
      this.handle = null
      this.auto = false
      ws?.setFuseMountpoint(null)
      try {
        rmSync(mp, { recursive: true, force: true })
      } catch {
        // mountpoint may still be busy; caller can retry
      }
    }
  }

  async close(ws?: Workspace): Promise<void> {
    if (this.auto) await this.unmount(ws)
  }
}
