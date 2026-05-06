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

import { describe, expect, it } from 'vitest'
import type { MongoDriver } from '../core/mongodb/_driver.ts'
import { resolveMongoDBConfig } from '../resource/mongodb/config.ts'
import { MongoDBAccessor } from './mongodb.ts'

const STUB_DRIVER: MongoDriver = {
  listDatabases: () => Promise.resolve([]),
  listCollections: () => Promise.resolve([]),
  findDocuments: () => Promise.resolve([]),
  countDocuments: () => Promise.resolve(0),
  listIndexes: () => Promise.resolve([]),
  close: () => Promise.resolve(),
}

describe('MongoDBAccessor', () => {
  it('holds the driver and resolved config', () => {
    const config = resolveMongoDBConfig({ uri: 'mongodb://localhost' })
    const accessor = new MongoDBAccessor(STUB_DRIVER, config)
    expect(accessor.driver).toBe(STUB_DRIVER)
    expect(accessor.config).toBe(config)
  })
})
