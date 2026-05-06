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
import { AUTHOR_FILES, detectAuthorScope } from './author_scope.ts'

function notFound(p: string): Error {
  const err = new Error(p) as Error & { code?: string }
  err.code = 'ENOENT'
  return err
}

export async function readdir(
  _accessor: SSCholarAccessor,
  path: PathSpec | string,
  index?: IndexCacheStore,
): Promise<string[]> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const prefix = spec.prefix
  const scope = detectAuthorScope(spec)
  const key = scope.resourcePath.replace(/^\/+|\/+$/g, '')
  const virtualKey = key !== '' ? `${prefix}/${key}` : prefix !== '' ? prefix : '/'

  if (scope.level === 'invalid') throw notFound(spec.original)

  if (index !== undefined) {
    const cached = await index.listDir(virtualKey)
    if (cached.entries !== null && cached.entries !== undefined) return cached.entries
  }

  if (scope.level === 'root') {
    if (index !== undefined) await index.setDir(virtualKey, [])
    return []
  }

  if (scope.level === 'author' && scope.authorId !== null) {
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    for (const f of AUTHOR_FILES) {
      entries.push([
        f,
        new IndexEntry({ id: f, name: f, resourceType: 'sscholar-author/file', vfsName: f }),
      ])
      names.push(`${prefix}/${key}/${f}`)
    }
    if (index !== undefined) await index.setDir(virtualKey, entries)
    return names
  }

  throw notFound(spec.original)
}
