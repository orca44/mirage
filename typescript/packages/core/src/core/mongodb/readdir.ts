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
import { IndexEntry } from '../../cache/index/config.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import type { MongoDBConfigResolved } from '../../resource/mongodb/config.ts'
import { PathSpec } from '../../types.ts'
import { listCollections, listDatabases } from './_client.ts'

function isSingleDb(config: MongoDBConfigResolved): boolean {
  return config.databases !== null && config.databases.length === 1
}

function singleDbName(config: MongoDBConfigResolved): string | null {
  if (config.databases !== null && config.databases.length === 1) {
    return config.databases[0] ?? null
  }
  return null
}

export async function readdir(
  accessor: MongoDBAccessor,
  path: PathSpec | string,
  index?: IndexCacheStore,
): Promise<string[]> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const prefix = spec.prefix
  let raw = spec.pattern !== null ? spec.directory : spec.original
  if (prefix !== '' && raw.startsWith(prefix)) {
    raw = raw.slice(prefix.length) || '/'
  }
  const key = raw.replace(/^\/+|\/+$/g, '')

  if (key !== '' && key.split('/').some((p) => p.startsWith('.'))) {
    const err = new Error(raw) as Error & { code?: string }
    err.code = 'ENOENT'
    throw err
  }

  const virtualKey = key !== '' ? `${prefix}/${key}` : prefix !== '' ? prefix : '/'

  if (key === '') {
    if (isSingleDb(accessor.config)) {
      const db = singleDbName(accessor.config)
      if (db === null) {
        const err = new Error(raw) as Error & { code?: string }
        err.code = 'ENOENT'
        throw err
      }
      return readdirCollections(accessor, db, virtualKey, index, prefix, true)
    }
    if (index !== undefined) {
      const cached = await index.listDir(virtualKey)
      if (cached.entries !== null && cached.entries !== undefined) return cached.entries
    }
    const dbs = await listDatabases(accessor)
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    for (const db of dbs) {
      entries.push([
        db,
        new IndexEntry({
          id: db,
          name: db,
          resourceType: 'mongodb/database',
          vfsName: db,
        }),
      ])
      names.push(`${prefix}/${db}`)
    }
    if (index !== undefined) await index.setDir(virtualKey, entries)
    return names
  }

  const parts = key.split('/')
  if (parts.length === 1) {
    const dbName = parts[0] ?? ''
    return readdirCollections(accessor, dbName, virtualKey, index, prefix, false)
  }

  const err = new Error(raw) as Error & { code?: string }
  err.code = 'ENOENT'
  throw err
}

async function readdirCollections(
  accessor: MongoDBAccessor,
  dbName: string,
  virtualKey: string,
  index: IndexCacheStore | undefined,
  prefix: string,
  collapsed: boolean,
): Promise<string[]> {
  if (index !== undefined) {
    const cached = await index.listDir(virtualKey)
    if (cached.entries !== null && cached.entries !== undefined) return cached.entries
  }
  const collections = await listCollections(accessor, dbName)
  const entries: [string, IndexEntry][] = []
  const names: string[] = []
  for (const col of collections) {
    const filename = `${col}.jsonl`
    entries.push([
      filename,
      new IndexEntry({
        id: col,
        name: col,
        resourceType: 'mongodb/collection',
        vfsName: filename,
      }),
    ])
    const fullPath = collapsed ? `${prefix}/${filename}` : `${prefix}/${dbName}/${filename}`
    names.push(fullPath)
  }
  if (index !== undefined) await index.setDir(virtualKey, entries)
  return names
}
