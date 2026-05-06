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
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from './app.ts'
import { restoreAll, snapshotAll } from './persist.ts'

describe('snapshotAll + restoreAll', () => {
  it('round-trips a RAM workspace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mirage-persist-'))
    try {
      const app = buildApp()
      await app.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          id: 'persist-w',
          config: { mounts: { '/': { resource: 'ram', mode: 'write' } } },
        },
      })
      await app.inject({
        method: 'POST',
        url: '/v1/workspaces/persist-w/execute',
        payload: { command: 'echo hello > /a.txt' },
      })
      const saved = await snapshotAll(app.registry, dir)
      expect(saved).toBe(1)
      expect(existsSync(join(dir, 'persist-w.tar'))).toBe(true)
      await app.close()

      const app2 = buildApp()
      const [restored] = await restoreAll(app2.registry, dir)
      expect(restored).toBe(1)
      expect(app2.registry.has('persist-w')).toBe(true)
      const r = await app2.inject({
        method: 'POST',
        url: '/v1/workspaces/persist-w/execute',
        payload: { command: 'cat /a.txt' },
      })
      const body = r.json<{ stdout: string }>()
      expect(body.stdout.trim()).toBe('hello')
      await app2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('snapshot endpoint', () => {
  it('GET /v1/workspaces/:id/snapshot returns tar bytes', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      payload: {
        id: 'snap-w',
        config: { mounts: { '/': { resource: 'ram', mode: 'write' } } },
      },
    })
    const r = await app.inject({ method: 'GET', url: '/v1/workspaces/snap-w/snapshot' })
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toBe('application/x-tar')
    expect(r.headers['content-disposition']).toBe('attachment; filename="snap-w.tar"')
    expect(r.rawPayload.length).toBeGreaterThan(0)
    await app.close()
  })

  it('GET /v1/workspaces/:id/snapshot returns 404 for missing workspace', async () => {
    const app = buildApp()
    const r = await app.inject({ method: 'GET', url: '/v1/workspaces/nope/snapshot' })
    expect(r.statusCode).toBe(404)
    await app.close()
  })
})
