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

import { defaultFingerprint } from '@struktoai/mirage-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RedisFileCacheStore } from './file.ts'

const REDIS_URL = process.env.REDIS_URL
const skip = REDIS_URL === undefined

describe.skipIf(skip)('RedisFileCacheStore', () => {
  let cache: RedisFileCacheStore
  const prefix = `mirage:cache:test:${String(Date.now())}:${Math.random().toString(36).slice(2)}:`

  beforeEach(async () => {
    cache = new RedisFileCacheStore(
      REDIS_URL !== undefined ? { url: REDIS_URL, keyPrefix: prefix } : { keyPrefix: prefix },
    )
    await cache.open()
    await cache.clear()
  })

  afterEach(async () => {
    await cache.clear()
    await cache.close()
  })

  it('set + get round-trips binary data', async () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff, 0x10])
    await cache.set('key1', bytes)
    const got = await cache.get('key1')
    expect(got).toEqual(bytes)
  })

  it('returns null for missing key', async () => {
    expect(await cache.get('nope')).toBeNull()
  })

  it('add returns false if key exists, true otherwise', async () => {
    const data = new Uint8Array([1, 2, 3])
    expect(await cache.add('k', data)).toBe(true)
    expect(await cache.add('k', data)).toBe(false)
  })

  it('remove deletes data and meta', async () => {
    await cache.set('k', new Uint8Array([9]))
    expect(await cache.exists('k')).toBe(true)
    await cache.remove('k')
    expect(await cache.exists('k')).toBe(false)
    expect(await cache.get('k')).toBeNull()
  })

  it('isFresh matches fingerprint', async () => {
    const data = new Uint8Array([1, 1, 1])
    const fp = defaultFingerprint(data)
    await cache.set('k', data, { fingerprint: fp })
    expect(await cache.isFresh('k', fp)).toBe(true)
    expect(await cache.isFresh('k', 'other')).toBe(false)
  })

  it('ttl expires entries', async () => {
    await cache.set('k', new Uint8Array([1]), { ttl: 1 })
    expect(await cache.get('k')).not.toBeNull()
    await new Promise((r) => setTimeout(r, 1100))
    expect(await cache.get('k')).toBeNull()
  })

  it('multiGet returns [bytes|null] in order', async () => {
    await cache.set('a', new Uint8Array([1]))
    await cache.set('c', new Uint8Array([3]))
    const out = await cache.multiGet(['a', 'b', 'c'])
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual(new Uint8Array([1]))
    expect(out[1]).toBeNull()
    expect(out[2]).toEqual(new Uint8Array([3]))
  })

  it('allCached true only when every key present', async () => {
    await cache.set('a', new Uint8Array([1]))
    expect(await cache.allCached(['a'])).toBe(true)
    expect(await cache.allCached(['a', 'b'])).toBe(false)
  })

  it('clear removes everything under the prefix', async () => {
    await cache.set('a', new Uint8Array([1]))
    await cache.set('b', new Uint8Array([2]))
    await cache.clear()
    expect(await cache.exists('a')).toBe(false)
    expect(await cache.exists('b')).toBe(false)
  })
})
