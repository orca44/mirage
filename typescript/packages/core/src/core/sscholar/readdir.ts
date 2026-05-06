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

import type { SSCholarAccessor } from '../../accessor/sscholar.ts'
import { IndexEntry } from '../../cache/index/config.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { PathSpec } from '../../types.ts'
import { searchPapersByField } from './_client.ts'
import { PAPER_FILES, SSCHOLAR_FIELD_SLUGS, SSCHOLAR_YEARS } from './fields.ts'
import { detectScope } from './scope.ts'

function notFound(p: string): Error {
  const err = new Error(p) as Error & { code?: string }
  err.code = 'ENOENT'
  return err
}

async function buildStaticDir(
  items: readonly string[],
  resourceType: string,
  prefix: string,
  key: string,
  index?: IndexCacheStore,
): Promise<string[]> {
  const virtualKey = key !== '' ? `${prefix}/${key}` : prefix !== '' ? prefix : '/'
  const entries: [string, IndexEntry][] = []
  const names: string[] = []
  for (const item of items) {
    entries.push([item, new IndexEntry({ id: item, name: item, resourceType, vfsName: item })])
    const full = key !== '' ? `${prefix}/${key}/${item}` : `${prefix}/${item}`
    names.push(full)
  }
  if (index !== undefined) await index.setDir(virtualKey, entries)
  return names
}

export async function readdir(
  accessor: SSCholarAccessor,
  path: PathSpec | string,
  index?: IndexCacheStore,
): Promise<string[]> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const prefix = spec.prefix
  const scope = detectScope(spec)
  const key = scope.resourcePath.replace(/^\/+|\/+$/g, '')
  const virtualKey = key !== '' ? `${prefix}/${key}` : prefix !== '' ? prefix : '/'

  if (scope.level === 'invalid') throw notFound(spec.original)

  if (index !== undefined) {
    const cached = await index.listDir(virtualKey)
    if (cached.entries !== null && cached.entries !== undefined) return cached.entries
  }

  if (scope.level === 'root') {
    return buildStaticDir(SSCHOLAR_FIELD_SLUGS, 'sscholar/field', prefix, '', index)
  }

  if (scope.level === 'field') {
    return buildStaticDir(SSCHOLAR_YEARS, 'sscholar/year', prefix, key, index)
  }

  if (scope.level === 'year' && scope.field !== null && scope.year !== null) {
    const limit = accessor.config.defaultListLimit
    const result = await searchPapersByField(accessor, scope.field, scope.year, limit, 0)
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    for (const paper of result.data) {
      const id = paper.paperId
      entries.push([
        id,
        new IndexEntry({
          id,
          name: paper.title ?? id,
          resourceType: 'sscholar/paper',
          vfsName: id,
        }),
      ])
      names.push(`${prefix}/${key}/${id}`)
    }
    if (index !== undefined) await index.setDir(virtualKey, entries)
    return names
  }

  if (scope.level === 'paper') {
    return buildStaticDir(PAPER_FILES, 'sscholar/file', prefix, key, index)
  }

  throw notFound(spec.original)
}
