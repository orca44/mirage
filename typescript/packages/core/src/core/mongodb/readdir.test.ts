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
  listDatabases: vi.fn(),
  listCollections: vi.fn(),
}))

import { MongoDBAccessor } from '../../accessor/mongodb.ts'
import { RAMIndexCacheStore } from '../../cache/index/ram.ts'
import { resolveMongoDBConfig, type MongoDBConfig } from '../../resource/mongodb/config.ts'
import { PathSpec } from '../../types.ts'
import * as _client from './_client.ts'
import type { MongoDriver } from './_driver.ts'
import { readdir } from './readdir.ts'

const STUB_DRIVER: MongoDriver = {
  listDatabases: () => Promise.resolve([]),
  listCollections: () => Promise.resolve([]),
  findDocuments: () => Promise.resolve([]),
  countDocuments: () => Promise.resolve(0),
  listIndexes: () => Promise.resolve([]),
  close: () => Promise.resolve(),
}

function makeAccessor(cfgOverrides: Partial<MongoDBConfig> = {}): MongoDBAccessor {
  const cfg = resolveMongoDBConfig({ uri: 'mongodb://h', ...cfgOverrides })
  return new MongoDBAccessor(STUB_DRIVER, cfg)
}

describe('readdir', () => {
  it('lists root: databases with mount prefix', async () => {
    vi.mocked(_client.listDatabases).mockResolvedValue(['app', 'analytics'])
    const accessor = makeAccessor()
    const path = new PathSpec({ original: '/mongo/', directory: '/mongo/', prefix: '/mongo' })
    const out = await readdir(accessor, path)
    expect(out).toEqual(['/mongo/app', '/mongo/analytics'])
  })

  it('lists database level: <col>.jsonl files', async () => {
    vi.mocked(_client.listCollections).mockResolvedValue(['users', 'orders'])
    const out = await readdir(
      makeAccessor(),
      new PathSpec({ original: '/mongo/app', directory: '/mongo/app', prefix: '/mongo' }),
    )
    expect(out).toEqual(['/mongo/app/users.jsonl', '/mongo/app/orders.jsonl'])
  })

  it('single-db mode collapses root to collections', async () => {
    vi.mocked(_client.listCollections).mockResolvedValue(['users'])
    const out = await readdir(
      makeAccessor({ databases: ['app'] }),
      new PathSpec({ original: '/mongo/', directory: '/mongo/', prefix: '/mongo' }),
    )
    expect(out).toEqual(['/mongo/users.jsonl'])
  })

  it('caches root listing in index when provided', async () => {
    vi.mocked(_client.listDatabases).mockResolvedValue(['app'])
    const index = new RAMIndexCacheStore()
    const accessor = makeAccessor()
    const path = new PathSpec({ original: '/mongo/', directory: '/mongo/', prefix: '/mongo' })
    await readdir(accessor, path, index)
    vi.mocked(_client.listDatabases).mockClear()
    await readdir(accessor, path, index)
    expect(_client.listDatabases).not.toHaveBeenCalled()
  })

  it('throws ENOENT for file-level paths', async () => {
    await expect(
      readdir(
        makeAccessor(),
        new PathSpec({
          original: '/mongo/app/users.jsonl',
          directory: '/mongo/app/',
          prefix: '/mongo',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
