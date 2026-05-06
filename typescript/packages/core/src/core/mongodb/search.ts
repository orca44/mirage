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
import { findDocuments, listCollections, listIndexes } from './_client.ts'

export interface CollectionMatches {
  database: string
  collection: string
  docs: Record<string, unknown>[]
}

async function regexFilter(
  accessor: MongoDBAccessor,
  database: string,
  collection: string,
  pattern: string,
): Promise<Record<string, unknown>[]> {
  const sample = await findDocuments(accessor, database, collection, {}, { limit: 1 })
  const first = sample[0]
  if (first === undefined) return [{}]
  const stringFields: string[] = []
  for (const [k, v] of Object.entries(first)) {
    if (k !== '_id' && typeof v === 'string') stringFields.push(k)
  }
  if (stringFields.length === 0) return [{}]
  return stringFields.map((f) => ({ [f]: { $regex: pattern, $options: 'i' } }))
}

export async function searchCollection(
  accessor: MongoDBAccessor,
  database: string,
  collection: string,
  pattern: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const indexes = await listIndexes(accessor, database, collection)
  const hasTextIndex = indexes.some((idx) => {
    const key = idx.key as Record<string, unknown> | undefined
    if (key === undefined) return false
    return Object.values(key).some((v) => v === 'text')
  })
  if (hasTextIndex) {
    return findDocuments(accessor, database, collection, { $text: { $search: pattern } }, { limit })
  }
  const orFilters = await regexFilter(accessor, database, collection, pattern)
  return findDocuments(accessor, database, collection, { $or: orFilters }, { limit })
}

export async function searchDatabase(
  accessor: MongoDBAccessor,
  database: string,
  pattern: string,
  limit: number,
): Promise<CollectionMatches[]> {
  const collections = await listCollections(accessor, database)
  const out: CollectionMatches[] = []
  for (const col of collections) {
    const docs = await searchCollection(accessor, database, col, pattern, limit)
    if (docs.length > 0) out.push({ database, collection: col, docs })
  }
  return out
}

export function formatGrepResults(results: readonly CollectionMatches[]): string[] {
  const lines: string[] = []
  for (const { database, collection, docs } of results) {
    for (const doc of docs) {
      const copy: Record<string, unknown> = { ...doc }
      if (copy._id !== undefined && copy._id !== null) {
        copy._id = stringifyId(copy._id)
      }
      lines.push(`${database}/${collection}.jsonl:${JSON.stringify(copy, bsonReplacer)}`)
    }
  }
  return lines
}

function bsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'object' && value !== null && 'toJSON' in value) {
    try {
      return (value as { toJSON: () => unknown }).toJSON()
    } catch {
      return safeToString(value)
    }
  }
  return value
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
