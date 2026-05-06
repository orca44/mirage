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
import { FileStat, FileType, PathSpec } from '../../types.ts'
import { countDocuments, listIndexes } from './_client.ts'

function isSingleDb(config: MongoDBConfigResolved): boolean {
  return config.databases !== null && config.databases.length === 1
}

function singleDbName(config: MongoDBConfigResolved): string | null {
  if (config.databases !== null && config.databases.length === 1) {
    return config.databases[0] ?? null
  }
  return null
}

export async function stat(
  accessor: MongoDBAccessor,
  path: PathSpec | string,
  _index?: IndexCacheStore,
): Promise<FileStat> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const prefix = spec.prefix
  let raw = spec.original
  if (prefix !== '' && raw.startsWith(prefix)) {
    raw = raw.slice(prefix.length) || '/'
  }
  const key = raw.replace(/^\/+|\/+$/g, '')

  if (key === '') {
    return new FileStat({ name: '/', type: FileType.DIRECTORY })
  }

  const parts = key.split('/')
  if (parts.some((p) => p.startsWith('.'))) {
    const err = new Error(raw) as Error & { code?: string }
    err.code = 'ENOENT'
    throw err
  }

  if (isSingleDb(accessor.config) && parts.length === 1 && (parts[0] ?? '').endsWith('.jsonl')) {
    const db = singleDbName(accessor.config)
    if (db === null) {
      const err = new Error(raw) as Error & { code?: string }
      err.code = 'ENOENT'
      throw err
    }
    const filename = parts[0] ?? ''
    const colName = filename.slice(0, -'.jsonl'.length)
    return collectionStat(accessor, db, colName, filename)
  }

  if (parts.length === 1 && !(parts[0] ?? '').endsWith('.jsonl')) {
    const dbName = parts[0] ?? ''
    return new FileStat({
      name: dbName,
      type: FileType.DIRECTORY,
      extra: { database: dbName },
    })
  }

  if (parts.length === 2 && (parts[1] ?? '').endsWith('.jsonl')) {
    const dbName = parts[0] ?? ''
    const filename = parts[1] ?? ''
    const colName = filename.slice(0, -'.jsonl'.length)
    return collectionStat(accessor, dbName, colName, filename)
  }

  const err = new Error(raw) as Error & { code?: string }
  err.code = 'ENOENT'
  throw err
}

async function collectionStat(
  accessor: MongoDBAccessor,
  dbName: string,
  colName: string,
  filename: string,
): Promise<FileStat> {
  const docCount = await countDocuments(accessor, dbName, colName)
  const indexes = await listIndexes(accessor, dbName, colName)
  const indexInfo = indexes.map((idx) => ({
    name: idx.name ?? null,
    keys: { ...((idx.key as Record<string, unknown> | undefined) ?? {}) },
  }))
  return new FileStat({
    name: filename,
    type: FileType.TEXT,
    size: null,
    extra: {
      database: dbName,
      collection: colName,
      document_count: docCount,
      indexes: indexInfo,
    },
  })
}
