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
import type { MongoFindOptions } from './_driver.ts'

const SYSTEM_DBS: ReadonlySet<string> = new Set(['admin', 'local', 'config'])

export async function listDatabases(accessor: MongoDBAccessor): Promise<string[]> {
  const all = await accessor.driver.listDatabases()
  let dbs = all.filter((d) => !SYSTEM_DBS.has(d))
  const allow = accessor.config.databases
  if (allow !== null) {
    const allowSet = new Set(allow)
    dbs = dbs.filter((d) => allowSet.has(d))
  }
  return [...dbs].sort()
}

export async function listCollections(
  accessor: MongoDBAccessor,
  database: string,
): Promise<string[]> {
  const cols = await accessor.driver.listCollections(database)
  return [...cols].sort()
}

export async function findDocuments<T = Record<string, unknown>>(
  accessor: MongoDBAccessor,
  database: string,
  collection: string,
  filter: Record<string, unknown> = {},
  options: MongoFindOptions = {},
): Promise<T[]> {
  const cap = accessor.config.maxDocLimit
  const requested = options.limit ?? cap
  const limit = Math.min(requested, cap)
  return accessor.driver.findDocuments<T>(database, collection, filter, {
    ...options,
    limit,
  })
}

export async function countDocuments(
  accessor: MongoDBAccessor,
  database: string,
  collection: string,
  filter: Record<string, unknown> = {},
): Promise<number> {
  return accessor.driver.countDocuments(database, collection, filter)
}

export async function listIndexes(
  accessor: MongoDBAccessor,
  database: string,
  collection: string,
): Promise<Record<string, unknown>[]> {
  return accessor.driver.listIndexes(database, collection)
}
