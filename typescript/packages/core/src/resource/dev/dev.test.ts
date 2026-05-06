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

import { describe, expect, it } from 'vitest'
import { OpsRegistry } from '../../ops/registry.ts'
import { MountMode, PathSpec, ResourceName } from '../../types.ts'
import { Workspace } from '../../workspace/workspace.ts'
import { RAMResource } from '../ram/ram.ts'
import { DevResource } from './dev.ts'

function setupOps(): { dev: DevResource; registry: OpsRegistry } {
  const dev = new DevResource()
  const registry = new OpsRegistry()
  for (const op of dev.ops()) registry.register(op)
  return { dev, registry }
}

function call(
  registry: OpsRegistry,
  name: string,
  dev: DevResource,
  path: string,
  ...args: unknown[]
): Promise<unknown> {
  return registry.call(name, ResourceName.RAM, dev.accessor, PathSpec.fromStrPath(path), args)
}

describe('DevResource', () => {
  it('reports kind = ram (matching Python parity)', () => {
    expect(new DevResource().kind).toBe(ResourceName.RAM)
  })

  it('exposes the same op surface as RAMResource', () => {
    const dev = new DevResource()
    const names = dev
      .ops()
      .map((o) => o.name)
      .sort()
    expect(names).toContain('read')
    expect(names).toContain('write')
    expect(names).toContain('readdir')
    expect(names).toContain('stat')
  })

  it('reads /null as empty bytes', async () => {
    const { dev, registry } = setupOps()
    const data = (await call(registry, 'read', dev, '/null')) as Uint8Array
    expect(data.byteLength).toBe(0)
  })

  it('reads /zero as 1 MiB of zeros', async () => {
    const { dev, registry } = setupOps()
    const data = (await call(registry, 'read', dev, '/zero')) as Uint8Array
    expect(data.byteLength).toBe(1 << 20)
    expect(data.every((b) => b === 0)).toBe(true)
  })

  it('writes are silently discarded', async () => {
    const { dev, registry } = setupOps()
    await call(registry, 'write', dev, '/null', new TextEncoder().encode('ignored'))
    const after = (await call(registry, 'read', dev, '/null')) as Uint8Array
    expect(after.byteLength).toBe(0)
  })

  it('reads of unknown paths throw file-not-found', async () => {
    const { dev, registry } = setupOps()
    await expect(call(registry, 'read', dev, '/nope')).rejects.toThrow(/file not found/)
  })

  it('readdir of root lists /null and /zero', async () => {
    const { dev, registry } = setupOps()
    const entries = (await call(registry, 'readdir', dev, '/')) as string[]
    expect(entries.sort()).toEqual(['/null', '/zero'])
  })
})

describe('DevResource auto-mount in Workspace', () => {
  it('Workspace auto-mounts /dev/ without the user having to declare it', async () => {
    const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
    const [resolved] = await ws.resolve('/dev/null')
    expect(resolved.kind).toBe(ResourceName.RAM)
    await ws.close()
  })

  it('declaring /dev/ explicitly raises duplicate-mount (matches Python)', () => {
    expect(() => new Workspace({ '/dev': new DevResource() }, { mode: MountMode.WRITE })).toThrow(
      /duplicate mount prefix/,
    )
  })
})
