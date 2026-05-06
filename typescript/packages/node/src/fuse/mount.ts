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

import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Workspace } from '@struktoai/mirage-core'
import { loadOptionalPeer } from '../optional_peer.ts'
import { MirageFS } from './fs.ts'

export interface FuseHandle {
  mountpoint: string
  unmount: () => Promise<void>
}

export interface MountOptions {
  mountpoint?: string
  agentId?: string
  /**
   * When true, `@zkochan/fuse-native`'s `autoUnmount` flag is set so the
   * kernel releases the mount if the process exits abnormally. Defaults to
   * `true` on Linux, `false` on darwin — macFUSE rejects the option with
   * "unknown option `auto_unmount'". On darwin the SIGINT cleanup in
   * FuseManager runs `diskutil unmount force` instead.
   */
  autoUnmount?: boolean
  /** Extra options forwarded verbatim to `@zkochan/fuse-native`. */
  fuseOptions?: Record<string, unknown>
}

type FuseConstructor = new (
  mountpoint: string,
  ops: Record<string, unknown>,
  options?: Record<string, unknown>,
) => {
  mount: (cb: (err: Error | null) => void) => void
  unmount: (cb: (err: Error | null) => void) => void
}

async function loadFuse(): Promise<FuseConstructor> {
  const mod = await loadOptionalPeer(
    () => import('@zkochan/fuse-native') as unknown as Promise<{ default?: FuseConstructor }>,
    {
      feature: 'FUSE support',
      packageName: '@zkochan/fuse-native',
      docsUrl: 'https://mirage.dev/typescript/setup/fuse',
    },
  )
  const Fuse = (mod.default ?? mod) as unknown as FuseConstructor
  if (typeof Fuse !== 'function') {
    throw new Error('@zkochan/fuse-native did not export a constructor')
  }
  return Fuse
}

/** Fallback unmount via platform tools — mirrors Python's SIGINT handler. */
export function forceUnmount(mountpoint: string): void {
  try {
    if (process.platform === 'darwin') {
      execSync(`diskutil unmount force ${JSON.stringify(mountpoint)}`, { stdio: 'ignore' })
    } else {
      execSync(`fusermount -u ${JSON.stringify(mountpoint)}`, { stdio: 'ignore' })
    }
  } catch {
    // best-effort; caller already tried the clean path
  }
}

export async function mount(ws: Workspace, options: MountOptions = {}): Promise<FuseHandle> {
  const Fuse = await loadFuse()
  const mountpoint = options.mountpoint ?? mkdtempSync(join(tmpdir(), 'mirage-fuse-'))
  const agentId = options.agentId
  const mfs = new MirageFS(ws, agentId !== undefined ? { agentId } : {})
  const autoUnmount = options.autoUnmount ?? process.platform === 'linux'
  const fuseOpts: Record<string, unknown> = {
    force: true,
    mkdir: true,
    ...(autoUnmount ? { autoUnmount: true } : {}),
    ...(options.fuseOptions ?? {}),
  }
  const fuse = new Fuse(mountpoint, mfs.ops(), fuseOpts)
  await new Promise<void>((resolve, reject) => {
    fuse.mount((err) => {
      if (err === null) resolve()
      else reject(err)
    })
  })
  return {
    mountpoint,
    unmount: () =>
      new Promise<void>((resolve, reject) => {
        fuse.unmount((err) => {
          if (err === null) resolve()
          else reject(err)
        })
      }),
  }
}

export function mountBackground(ws: Workspace, options: MountOptions = {}): Promise<FuseHandle> {
  return mount(ws, options)
}
