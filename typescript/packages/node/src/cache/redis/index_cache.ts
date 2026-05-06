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

import {
  IndexCacheStore,
  IndexEntry,
  type IndexConfig,
  type ListResult,
  type LookupResult,
  LookupStatus,
} from '@struktoai/mirage-core'
import type { RedisClientType } from 'redis'
import { loadOptionalPeer } from '../../optional_peer.ts'

const ENTRY_PREFIX = 'mirage:idx:entry:'
const CHILDREN_PREFIX = 'mirage:idx:children:'

export interface RedisIndexCacheOptions {
  ttl?: number
  url?: string
  client?: RedisClientType
  keyPrefix?: string
}

export class RedisIndexCacheStore extends IndexCacheStore {
  private readonly ttl: number
  private readonly url: string
  private readonly providedClient: RedisClientType | null
  private readonly entryPrefix: string
  private readonly childrenPrefix: string
  private clientPromise: Promise<RedisClientType> | null = null

  constructor(options: RedisIndexCacheOptions = {}) {
    super()
    this.ttl = options.ttl ?? 600
    this.url = options.url ?? 'redis://localhost:6379/0'
    this.providedClient = options.client ?? null
    const prefix = options.keyPrefix ?? ''
    this.entryPrefix = `${prefix}${ENTRY_PREFIX}`
    this.childrenPrefix = `${prefix}${CHILDREN_PREFIX}`
  }

  static fromConfig(
    config: IndexConfig,
    extra: Omit<RedisIndexCacheOptions, 'ttl'> = {},
  ): RedisIndexCacheStore {
    return new RedisIndexCacheStore({ ttl: config.ttl ?? 600, ...extra })
  }

  private entryKey(path: string): string {
    return `${this.entryPrefix}${path}`
  }

  private childrenKey(path: string): string {
    return `${this.childrenPrefix}${path}`
  }

  private client(): Promise<RedisClientType> {
    if (this.providedClient !== null) return Promise.resolve(this.providedClient)
    this.clientPromise ??= (async () => {
      const mod = await loadOptionalPeer(
        () =>
          import('redis') as unknown as Promise<{
            createClient: (o: { url: string }) => RedisClientType
          }>,
        { feature: 'RedisIndexCacheStore', packageName: 'redis' },
      )
      const c = mod.createClient({
        url: this.url,
        socket: { reconnectStrategy: false },
      } as Parameters<typeof mod.createClient>[0])
      await c.connect()
      return c
    })()
    return this.clientPromise
  }

  async get(resourcePath: string): Promise<LookupResult> {
    const c = await this.client()
    const raw = await c.get(this.entryKey(resourcePath))
    if (raw === null) return { status: LookupStatus.NOT_FOUND }
    const parsed = JSON.parse(raw) as {
      id: string
      name: string
      resourceType: string
      remoteTime?: string
      indexTime?: string
      vfsName?: string
      size?: number | null
    }
    return { entry: new IndexEntry(parsed) }
  }

  async put(resourcePath: string, entry: IndexEntry): Promise<void> {
    const c = await this.client()
    const stored =
      entry.indexTime === '' ? entry.copyWith({ indexTime: new Date().toISOString() }) : entry
    await c.set(this.entryKey(resourcePath), JSON.stringify(this.serialize(stored)))
  }

  async listDir(resourcePath: string): Promise<ListResult> {
    const c = await this.client()
    const key = this.childrenKey(resourcePath)
    const exists = await c.exists(key)
    if (!exists) return { status: LookupStatus.NOT_FOUND }
    const ttlRemaining = await c.ttl(key)
    if (ttlRemaining === -2) return { status: LookupStatus.EXPIRED }
    const raw = await c.lRange(key, 0, -1)
    return { entries: [...raw].sort() }
  }

  async setDir(
    resourcePath: string,
    entries: readonly [string, IndexEntry][],
    expiredAt?: Date | null,
  ): Promise<void> {
    const c = await this.client()
    const now = new Date()
    const nowIso = now.toISOString()
    const prefix = resourcePath === '/' ? '/' : `${resourcePath}/`
    const pipe = c.multi()
    const childKeys: string[] = []
    for (const [name, entry] of entries) {
      const fullPath = prefix + name
      const stored = entry.indexTime === '' ? entry.copyWith({ indexTime: nowIso }) : entry
      pipe.set(this.entryKey(fullPath), JSON.stringify(this.serialize(stored)))
      childKeys.push(fullPath)
    }
    const childrenKey = this.childrenKey(resourcePath)
    pipe.del(childrenKey)
    if (childKeys.length > 0) {
      childKeys.sort()
      pipe.rPush(childrenKey, childKeys)
    }
    const ttlSeconds =
      expiredAt !== null && expiredAt !== undefined
        ? Math.max(1, Math.floor((expiredAt.getTime() - now.getTime()) / 1000))
        : Math.max(1, Math.floor(this.ttl))
    pipe.expire(childrenKey, ttlSeconds)
    await pipe.exec()
  }

  async invalidateDir(resourcePath: string): Promise<void> {
    const c = await this.client()
    await c.del(this.childrenKey(resourcePath))
  }

  async clear(): Promise<void> {
    const c = await this.client()
    for (const pattern of [`${this.entryPrefix}*`, `${this.childrenPrefix}*`]) {
      const keys: string[] = []
      for await (const k of c.scanIterator({ MATCH: pattern })) {
        if (Array.isArray(k)) keys.push(...k)
        else keys.push(k)
      }
      if (keys.length > 0) await c.del(keys)
    }
  }

  async close(): Promise<void> {
    if (this.providedClient !== null) return
    if (this.clientPromise === null) return
    const c = await this.clientPromise
    const typed = c as unknown as { destroy?: () => void }
    if (typeof typed.destroy === 'function') typed.destroy()
    else if (c.isOpen) await c.quit()
    this.clientPromise = null
  }

  private serialize(e: IndexEntry): Record<string, unknown> {
    return {
      id: e.id,
      name: e.name,
      resourceType: e.resourceType,
      remoteTime: e.remoteTime,
      indexTime: e.indexTime,
      vfsName: e.vfsName,
      size: e.size,
    }
  }
}
