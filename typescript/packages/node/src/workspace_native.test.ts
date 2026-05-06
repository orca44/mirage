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

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ExecuteResult, MountMode, type ProvisionResult } from '@struktoai/mirage-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RAMResource } from '@struktoai/mirage-core'
import { Workspace } from './workspace.ts'

function asExec(r: ExecuteResult | ProvisionResult): ExecuteResult {
  if (!('exitCode' in r)) throw new Error('expected ExecuteResult, got ProvisionResult')
  return r
}

const DEC = new TextDecoder()

describe('Workspace.setFuseMountpoint', () => {
  it('starts null and round-trips', () => {
    const ws = new Workspace({ '/data/': new RAMResource() })
    expect(ws.fuseMountpoint).toBeNull()
    ws.setFuseMountpoint('/tmp/test')
    expect(ws.fuseMountpoint).toBe('/tmp/test')
    ws.setFuseMountpoint(null)
    expect(ws.fuseMountpoint).toBeNull()
  })

  it('tracks ownsFuseMount only when owned=true is passed', () => {
    const ws = new Workspace({ '/data/': new RAMResource() })
    expect(ws.ownsFuseMount).toBe(false)

    ws.setFuseMountpoint('/tmp/external')
    expect(ws.ownsFuseMount).toBe(false)

    ws.setFuseMountpoint('/tmp/owned', { owned: true })
    expect(ws.ownsFuseMount).toBe(true)

    ws.setFuseMountpoint(null)
    expect(ws.ownsFuseMount).toBe(false)
  })
})

describe('Workspace.execute({ native: true }) dispatch', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mirage-native-ws-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('routes to subprocess when an external fuseMountpoint is set', async () => {
    writeFileSync(join(tmp, 'hello.txt'), 'hello world\n')
    const ws = new Workspace({ '/data/': new RAMResource() }, { mode: MountMode.WRITE })
    // owned=false: an external mount owned by another process.
    ws.setFuseMountpoint(tmp)

    const res = asExec(await ws.execute('cat hello.txt', { native: true }))
    expect(DEC.decode(res.stdout)).toBe('hello world\n')
    expect(res.exitCode).toBe(0)
    await ws.close()
  })

  it('falls back to virtual mode when no fuseMountpoint is set', async () => {
    const ws = new Workspace({ '/data/': new RAMResource() })
    const res = asExec(await ws.execute('echo hello', { native: true }))
    expect(res.exitCode).toBe(0)
    await ws.close()
  })

  it('raises a helpful error when the mount is owned in-process (deadlock guard)', async () => {
    const ws = new Workspace({ '/data/': new RAMResource() })
    // Simulate FuseManager.setup() setting owned=true
    ws.setFuseMountpoint('/tmp/mirage-owned', { owned: true })

    await expect(ws.execute('echo hi', { native: true })).rejects.toThrow(/deadlock/i)
    await ws.close()
  })

  it('honors the { native: true } constructor default', async () => {
    writeFileSync(join(tmp, 'x.txt'), 'from default\n')
    const ws = new Workspace(
      { '/data/': new RAMResource() },
      { mode: MountMode.WRITE, native: true },
    )
    ws.setFuseMountpoint(tmp) // external, no deadlock

    // No { native } flag passed — constructor default applies.
    const res = await ws.execute('cat x.txt')
    expect(DEC.decode(res.stdout)).toBe('from default\n')
    await ws.close()
  })

  it('per-call native=false overrides the constructor default', async () => {
    const ws = new Workspace(
      { '/data/': new RAMResource() },
      { mode: MountMode.WRITE, native: true },
    )
    ws.setFuseMountpoint(tmp)

    // Even though ws has native:true, this call opts out.
    const res = asExec(await ws.execute('echo via-virtual', { native: false }))
    expect(res.exitCode).toBe(0)
    await ws.close()
  })
})
