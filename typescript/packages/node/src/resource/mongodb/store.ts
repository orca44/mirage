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

import { loadOptionalPeer, type MongoDriver, type MongoFindOptions } from '@struktoai/mirage-core'

interface MongoCollectionLike {
  find: (
    filter: Record<string, unknown>,
    options?: { projection?: Record<string, unknown> },
  ) => {
    sort: (sort: Record<string, 1 | -1>) => MongoCursorLike
    skip: (n: number) => MongoCursorLike
    limit: (n: number) => MongoCursorLike
    toArray: () => Promise<Record<string, unknown>[]>
  }
  countDocuments: (filter?: Record<string, unknown>) => Promise<number>
  listIndexes: () => { toArray: () => Promise<Record<string, unknown>[]> }
}

interface MongoCursorLike {
  sort: (sort: Record<string, 1 | -1>) => MongoCursorLike
  skip: (n: number) => MongoCursorLike
  limit: (n: number) => MongoCursorLike
  toArray: () => Promise<Record<string, unknown>[]>
}

interface MongoDbLike {
  listCollections: () => { toArray: () => Promise<{ name: string }[]> }
  collection: (name: string) => MongoCollectionLike
  admin: () => { listDatabases: () => Promise<{ databases: { name: string }[] }> }
}

interface MongoClientLike {
  connect: () => Promise<MongoClientLike>
  db: (name?: string) => MongoDbLike
  close: () => Promise<void>
}

interface MongoModule {
  MongoClient: new (uri: string) => MongoClientLike
}

export class MongoDBStore implements MongoDriver {
  readonly uri: string
  private clientPromise: Promise<MongoClientLike> | null = null

  constructor(uri: string) {
    this.uri = uri
  }

  async listDatabases(): Promise<string[]> {
    const c = await this._client()
    const r = await c.db().admin().listDatabases()
    return r.databases.map((d) => d.name)
  }

  async listCollections(database: string): Promise<string[]> {
    const c = await this._client()
    const cols = await c.db(database).listCollections().toArray()
    return cols.map((col) => col.name)
  }

  async findDocuments<T = Record<string, unknown>>(
    database: string,
    collection: string,
    filter: Record<string, unknown> = {},
    options: MongoFindOptions = {},
  ): Promise<T[]> {
    const c = await this._client()
    let cursor = c
      .db(database)
      .collection(collection)
      .find(filter, {
        ...(options.projection !== undefined ? { projection: options.projection } : {}),
      }) as MongoCursorLike
    if (options.sort !== undefined) cursor = cursor.sort(options.sort)
    if (options.skip !== undefined) cursor = cursor.skip(options.skip)
    if (options.limit !== undefined) cursor = cursor.limit(options.limit)
    return (await cursor.toArray()) as T[]
  }

  async countDocuments(
    database: string,
    collection: string,
    filter: Record<string, unknown> = {},
  ): Promise<number> {
    const c = await this._client()
    return c.db(database).collection(collection).countDocuments(filter)
  }

  async listIndexes(database: string, collection: string): Promise<Record<string, unknown>[]> {
    const c = await this._client()
    return c.db(database).collection(collection).listIndexes().toArray()
  }

  async close(): Promise<void> {
    if (this.clientPromise === null) return
    const c = await this.clientPromise
    this.clientPromise = null
    await c.close()
  }

  private async _client(): Promise<MongoClientLike> {
    this.clientPromise ??= this._connect()
    return this.clientPromise
  }

  protected async _connect(): Promise<MongoClientLike> {
    const mod = await loadOptionalPeer(() => import('mongodb') as unknown as Promise<MongoModule>, {
      feature: 'MongoDBResource',
      packageName: 'mongodb',
    })
    const c = new mod.MongoClient(this.uri)
    await c.connect()
    return c
  }
}
