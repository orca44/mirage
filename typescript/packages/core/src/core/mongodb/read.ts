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

import type { MongoDBAccessor } from '../../accessor/mongodb.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import type { MongoDBConfigResolved } from '../../resource/mongodb/config.ts'
import { PathSpec } from '../../types.ts'
import { encodeBase64 } from '../../utils/base64.ts'
import { findDocuments } from './_client.ts'

export interface ReadOptions {
  limit?: number | null
  offset?: number | null
}

function isSingleDb(config: MongoDBConfigResolved): boolean {
  return config.databases !== null && config.databases.length === 1
}

function singleDbName(config: MongoDBConfigResolved): string | null {
  if (config.databases !== null && config.databases.length === 1) {
    return config.databases[0] ?? null
  }
  return null
}

function parseCollectionPath(key: string, config: MongoDBConfigResolved): [string, string] {
  const parts = key.split('/')
  if (isSingleDb(config) && parts.length === 1 && (parts[0] ?? '').endsWith('.jsonl')) {
    const db = singleDbName(config)
    if (db === null) throw notFound(key)
    return [db, (parts[0] ?? '').slice(0, -'.jsonl'.length)]
  }
  if (parts.length === 2 && (parts[1] ?? '').endsWith('.jsonl')) {
    return [parts[0] ?? '', (parts[1] ?? '').slice(0, -'.jsonl'.length)]
  }
  throw notFound(key)
}

function notFound(p: string): Error {
  const err = new Error(p) as Error & { code?: string }
  err.code = 'ENOENT'
  return err
}

function safeToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (typeof value === 'object' && 'toString' in value) {
    try {
      return (value as { toString: () => string }).toString()
    } catch {
      return Object.prototype.toString.call(value)
    }
  }
  return Object.prototype.toString.call(value)
}

function bsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return encodeBase64(value)
  if (typeof value === 'object' && value !== null && 'toJSON' in value) {
    try {
      return (value as { toJSON: () => unknown }).toJSON()
    } catch {
      return safeToString(value)
    }
  }
  return value
}

export async function read(
  accessor: MongoDBAccessor,
  path: PathSpec | string,
  _index?: IndexCacheStore,
  options: ReadOptions = {},
): Promise<Uint8Array> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const prefix = spec.prefix
  let raw = spec.original
  if (prefix !== '' && raw.startsWith(prefix)) {
    raw = raw.slice(prefix.length) || '/'
  }
  const key = raw.replace(/^\/+|\/+$/g, '')

  if (key !== '' && key.split('/').some((p) => p.startsWith('.'))) {
    throw notFound(raw)
  }

  const [dbName, colName] = parseCollectionPath(key, accessor.config)

  const limit = options.limit ?? null
  const offset = options.offset ?? null
  const effectiveLimit =
    limit !== null ? Math.min(limit, accessor.config.maxDocLimit) : accessor.config.defaultDocLimit
  const findOptions: { limit: number; sort: Record<string, 1 | -1>; skip?: number } = {
    limit: effectiveLimit,
    sort: { _id: 1 },
  }
  if (offset !== null && offset > 0) findOptions.skip = offset

  const docs = await findDocuments(accessor, dbName, colName, {}, findOptions)
  if (docs.length === 0) return new Uint8Array()

  const lines: string[] = []
  for (const doc of docs) {
    const copy: Record<string, unknown> = { ...doc }
    if (copy._id !== undefined && copy._id !== null) {
      copy._id = stringifyId(copy._id)
    }
    lines.push(JSON.stringify(copy, bsonReplacer))
  }
  return new TextEncoder().encode(lines.join('\n') + '\n')
}

function stringifyId(value: unknown): unknown {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (value === null || value === undefined) return value
  if (typeof value === 'object' && 'toString' in value) {
    try {
      const s = (value as { toString: () => string }).toString()
      if (s !== '[object Object]') return s
    } catch {
      return safeToString(value)
    }
  }
  return safeToString(value)
}
