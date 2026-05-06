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
  countDocuments: vi.fn(),
  listIndexes: vi.fn(),
}))

import { MongoDBAccessor } from '../../accessor/mongodb.ts'
import { resolveMongoDBConfig, type MongoDBConfig } from '../../resource/mongodb/config.ts'
import { FileType, PathSpec } from '../../types.ts'
import * as _client from './_client.ts'
import type { MongoDriver } from './_driver.ts'
import { stat } from './stat.ts'

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

describe('stat', () => {
  it('marks root as DIRECTORY', async () => {
    const r = await stat(
      makeAccessor(),
      new PathSpec({ original: '/mongo/', directory: '/mongo/', prefix: '/mongo' }),
    )
    expect(r.name).toBe('/')
    expect(r.type).toBe(FileType.DIRECTORY)
  })

  it('marks database level as DIRECTORY with extras', async () => {
    const r = await stat(
      makeAccessor(),
      new PathSpec({ original: '/mongo/app', directory: '/mongo/', prefix: '/mongo' }),
    )
    expect(r.type).toBe(FileType.DIRECTORY)
    expect(r.extra).toEqual({ database: 'app' })
  })

  it('marks collection file as TEXT with size=null and extras', async () => {
    vi.mocked(_client.countDocuments).mockResolvedValue(42)
    vi.mocked(_client.listIndexes).mockResolvedValue([{ name: '_id_', key: { _id: 1 } }])
    const r = await stat(
      makeAccessor(),
      new PathSpec({
        original: '/mongo/app/users.jsonl',
        directory: '/mongo/app/',
        prefix: '/mongo',
      }),
    )
    expect(r.type).toBe(FileType.TEXT)
    expect(r.size).toBeNull()
    expect(r.extra.document_count).toBe(42)
    expect(r.extra.indexes).toEqual([{ name: '_id_', keys: { _id: 1 } }])
  })

  it('single-db mode resolves /<col>.jsonl to a file', async () => {
    vi.mocked(_client.countDocuments).mockResolvedValue(7)
    vi.mocked(_client.listIndexes).mockResolvedValue([])
    const r = await stat(
      makeAccessor({ databases: ['app'] }),
      new PathSpec({
        original: '/mongo/users.jsonl',
        directory: '/mongo/',
        prefix: '/mongo',
      }),
    )
    expect(r.type).toBe(FileType.TEXT)
    expect(r.extra.database).toBe('app')
    expect(r.extra.collection).toBe('users')
  })

  it('throws ENOENT for invalid paths', async () => {
    await expect(
      stat(
        makeAccessor(),
        new PathSpec({
          original: '/mongo/a/b/c',
          directory: '/mongo/a/b/',
          prefix: '/mongo',
        }),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
