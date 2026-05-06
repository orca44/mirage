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

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.ts'

describe('buildApp onClose persistence', () => {
  it('snapshots workspaces on close when persistDir is set', async () => {
    const persistDir = mkdtempSync(join(tmpdir(), 'mirage-app-'))
    const app = buildApp({ persistDir })
    try {
      await app.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          id: 'persist-me',
          config: { mounts: { '/': { resource: 'ram', mode: 'write' } } },
        },
      })
      await app.close()
      expect(existsSync(join(persistDir, 'persist-me.tar'))).toBe(true)
      expect(existsSync(join(persistDir, 'index.json'))).toBe(true)
    } finally {
      await app.close().catch(() => undefined)
      rmSync(persistDir, { recursive: true, force: true })
    }
  })

  it('restores workspaces from persistDir on buildApp', async () => {
    const persistDir = mkdtempSync(join(tmpdir(), 'mirage-restore-'))
    const app1 = buildApp({ persistDir })
    try {
      await app1.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          id: 'round-trip',
          config: { mounts: { '/': { resource: 'ram', mode: 'write' } } },
        },
      })
      await app1.close()

      const app2 = buildApp({ persistDir })
      try {
        const start = Date.now()
        let body: { id: string }[] = []
        while (Date.now() - start < 10000) {
          const list = await app2.inject({ method: 'GET', url: '/v1/workspaces' })
          body = list.json<{ id: string }[]>()
          if (body.some((w) => w.id === 'round-trip')) break
          await new Promise((r) => setTimeout(r, 50))
        }
        expect(body.some((w) => w.id === 'round-trip')).toBe(true)
        await app2.close()
      } finally {
        await app2.close().catch(() => undefined)
      }
    } finally {
      await app1.close().catch(() => undefined)
      rmSync(persistDir, { recursive: true, force: true })
    }
  })

  it('skips snapshot when persistDir is not set', async () => {
    const persistDir = mkdtempSync(join(tmpdir(), 'mirage-app-skip-'))
    const app = buildApp({})
    try {
      await app.inject({
        method: 'POST',
        url: '/v1/workspaces',
        payload: {
          id: 'no-persist',
          config: { mounts: { '/': { resource: 'ram', mode: 'write' } } },
        },
      })
      await app.close()
      expect(existsSync(join(persistDir, 'no-persist.tar'))).toBe(false)
      expect(existsSync(join(persistDir, 'index.json'))).toBe(false)
    } finally {
      await app.close().catch(() => undefined)
      rmSync(persistDir, { recursive: true, force: true })
    }
  })
})
