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

import { describe, expect, it, vi } from 'vitest'

vi.mock('./_client.ts', () => ({
  fetchColumns: vi.fn(),
  estimatedRowCount: vi.fn(),
  tableSizeBytes: vi.fn(),
}))

import { PostgresAccessor } from '../../accessor/postgres.ts'
import { FileType, PathSpec } from '../../types.ts'
import { resolvePostgresConfig } from '../../resource/postgres/config.ts'
import type { PgDriver } from './_driver.ts'
import * as _client from './_client.ts'
import { stat } from './stat.ts'

const STUB_DRIVER: PgDriver = {
  query: () => Promise.resolve({ rows: [], rowCount: 0 }),
  close: () => Promise.resolve(),
}

function makeAccessor(): PostgresAccessor {
  const cfg = resolvePostgresConfig({ dsn: 'postgres://localhost/db' })
  return new PostgresAccessor(STUB_DRIVER, cfg)
}

describe('stat', () => {
  it('marks root as DIRECTORY', async () => {
    const r = await stat(
      makeAccessor(),
      new PathSpec({ original: '/pg/', directory: '/pg/', prefix: '/pg' }),
    )
    expect(r.name).toBe('/')
    expect(r.type).toBe(FileType.DIRECTORY)
  })

  it('marks database.json as JSON', async () => {
    const r = await stat(
      makeAccessor(),
      new PathSpec({ original: '/pg/database.json', directory: '/pg/', prefix: '/pg' }),
    )
    expect(r.type).toBe(FileType.JSON)
    expect(r.name).toBe('database.json')
  })

  it('marks schema/kind/entity as DIRECTORY with extras', async () => {
    const r = await stat(
      makeAccessor(),
      new PathSpec({
        original: '/pg/public/tables/users',
        directory: '/pg/public/tables/',
        prefix: '/pg',
      }),
    )
    expect(r.type).toBe(FileType.DIRECTORY)
    expect(r.extra).toEqual({ schema: 'public', kind: 'tables', name: 'users' })
  })

  it('marks rows.jsonl as TEXT with size + fingerprint', async () => {
    vi.mocked(_client.fetchColumns).mockResolvedValue([
      { name: 'id', type: 'uuid', nullable: false },
    ])
    vi.mocked(_client.estimatedRowCount).mockResolvedValue(42)
    vi.mocked(_client.tableSizeBytes).mockResolvedValue(4096)
    const r = await stat(
      makeAccessor(),
      new PathSpec({
        original: '/pg/public/tables/users/rows.jsonl',
        directory: '/pg/public/tables/users/',
        prefix: '/pg',
      }),
    )
    expect(r.type).toBe(FileType.TEXT)
    expect(r.size).toBe(4096)
    expect(r.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(r.extra.row_count).toBe(42)
  })

  it('throws ENOENT for invalid path', async () => {
    await expect(
      stat(
        makeAccessor(),
        new PathSpec({
          original: '/pg/public/sequences',
          directory: '/pg/public/',
          prefix: '/pg',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
