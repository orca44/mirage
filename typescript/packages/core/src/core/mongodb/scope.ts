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

import { PathSpec } from '../../types.ts'

export interface MongoDBScope {
  level: 'root' | 'database' | 'file' | 'invalid'
  database: string | null
  collection: string | null
  resourcePath: string
}

export interface DetectScopeOptions {
  singleDb?: boolean
  singleDbName?: string | null
}

export function detectScope(
  path: PathSpec | string,
  options: DetectScopeOptions = {},
): MongoDBScope {
  const singleDb = options.singleDb === true
  const singleDbName = options.singleDbName ?? null
  const raw = path instanceof PathSpec ? path.stripPrefix : path
  const key = raw.replace(/^\/+|\/+$/g, '')

  if (key === '') {
    if (singleDb) {
      return {
        level: 'database',
        database: singleDbName,
        collection: null,
        resourcePath: '/',
      }
    }
    return { level: 'root', database: null, collection: null, resourcePath: '/' }
  }

  const parts = key.split('/')

  if (singleDb) {
    if (key.endsWith('.jsonl')) {
      const col = key.slice(0, -'.jsonl'.length)
      return {
        level: 'file',
        database: singleDbName,
        collection: col,
        resourcePath: raw,
      }
    }
    return {
      level: 'database',
      database: singleDbName,
      collection: null,
      resourcePath: raw,
    }
  }

  if (parts.length === 1) {
    const part = parts[0] ?? ''
    if (part.endsWith('.jsonl')) {
      return {
        level: 'file',
        database: null,
        collection: part.slice(0, -'.jsonl'.length),
        resourcePath: raw,
      }
    }
    return {
      level: 'database',
      database: part,
      collection: null,
      resourcePath: raw,
    }
  }

  if (parts.length === 2) {
    const second = parts[1] ?? ''
    if (second.endsWith('.jsonl')) {
      return {
        level: 'file',
        database: parts[0] ?? null,
        collection: second.slice(0, -'.jsonl'.length),
        resourcePath: raw,
      }
    }
  }

  return { level: 'root', database: null, collection: null, resourcePath: raw }
}
