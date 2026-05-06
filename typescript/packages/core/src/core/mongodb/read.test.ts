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

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./_client.ts', () => ({
  findDocuments: vi.fn(),
}))

import { MongoDBAccessor } from '../../accessor/mongodb.ts'
import { resolveMongoDBConfig, type MongoDBConfig } from '../../resource/mongodb/config.ts'
import { PathSpec } from '../../types.ts'
import * as _client from './_client.ts'
import type { MongoDriver } from './_driver.ts'
import { read } from './read.ts'

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

function decode(b: Uint8Array): string {
  return new TextDecoder().decode(b)
}

describe('read', () => {
  beforeEach(() => {
    vi.mocked(_client.findDocuments).mockReset()
  })

  it('returns empty bytes when no docs', async () => {
    vi.mocked(_client.findDocuments).mockResolvedValue([])
    const out = await read(
      makeAccessor(),
      new PathSpec({
        original: '/mongo/app/users.jsonl',
        directory: '/mongo/app/',
        prefix: '/mongo',
      }),
    )
    expect(out.byteLength).toBe(0)
  })

  it('uses defaultDocLimit when no explicit limit', async () => {
    vi.mocked(_client.findDocuments).mockResolvedValue([{ _id: 'a', x: 1 }])
    await read(
      makeAccessor({ defaultDocLimit: 7 }),
      new PathSpec({
        original: '/mongo/app/users.jsonl',
        directory: '/mongo/app/',
        prefix: '/mongo',
      }),
    )
    const call = vi.mocked(_client.findDocuments).mock.calls[0]
    expect(call?.[4]?.limit).toBe(7)
    expect(call?.[4]?.sort).toEqual({ _id: 1 })
  })

  it('honors explicit limit/offset (skip)', async () => {
    vi.mocked(_client.findDocuments).mockResolvedValue([])
    await read(
      makeAccessor(),
      new PathSpec({
        original: '/mongo/app/users.jsonl',
        directory: '/mongo/app/',
        prefix: '/mongo',
      }),
      undefined,
      { limit: 10, offset: 5 },
    )
    const call = vi.mocked(_client.findDocuments).mock.calls[0]
    expect(call?.[4]?.limit).toBe(10)
    expect(call?.[4]?.skip).toBe(5)
  })

  it('serializes Date as ISO and stringifies _id', async () => {
    vi.mocked(_client.findDocuments).mockResolvedValue([
      { _id: { toString: () => 'abc123' }, ts: new Date('2026-04-30T00:00:00.000Z') },
    ])
    const out = await read(
      makeAccessor(),
      new PathSpec({
        original: '/mongo/app/users.jsonl',
        directory: '/mongo/app/',
        prefix: '/mongo',
      }),
    )
    expect(decode(out)).toBe('{"_id":"abc123","ts":"2026-04-30T00:00:00.000Z"}\n')
  })

  it('single-db mode resolves /<col>.jsonl', async () => {
    vi.mocked(_client.findDocuments).mockResolvedValue([{ _id: '1' }])
    await read(
      makeAccessor({ databases: ['app'] }),
      new PathSpec({
        original: '/mongo/users.jsonl',
        directory: '/mongo/',
        prefix: '/mongo',
      }),
    )
    const call = vi.mocked(_client.findDocuments).mock.calls[0]
    expect(call?.[1]).toBe('app')
    expect(call?.[2]).toBe('users')
  })
})
