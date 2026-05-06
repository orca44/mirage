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
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { FileStat, FileType, PathSpec } from '../../types.ts'
import { detectScope } from './scope.ts'

function notFound(p: string): Error {
  const err = new Error(p) as Error & { code?: string }
  err.code = 'ENOENT'
  return err
}

const FILE_TYPES: Record<string, FileType> = {
  'meta.json': FileType.JSON,
  'abstract.txt': FileType.TEXT,
  'tldr.txt': FileType.TEXT,
  'authors.json': FileType.JSON,
}

export function stat(
  _accessor: SSCholarAccessor,
  path: PathSpec | string,
  _index?: IndexCacheStore,
): Promise<FileStat> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const scope = detectScope(spec)

  if (scope.level === 'invalid') return Promise.reject(notFound(spec.original))

  if (scope.level === 'root') {
    return Promise.resolve(new FileStat({ name: '/', type: FileType.DIRECTORY }))
  }

  if (scope.level === 'field' && scope.fieldSlug !== null) {
    return Promise.resolve(
      new FileStat({
        name: scope.fieldSlug,
        type: FileType.DIRECTORY,
        extra: { field: scope.field ?? scope.fieldSlug },
      }),
    )
  }

  if (scope.level === 'year' && scope.year !== null) {
    return Promise.resolve(
      new FileStat({
        name: scope.year,
        type: FileType.DIRECTORY,
        extra: { field: scope.field, year: scope.year },
      }),
    )
  }

  if (scope.level === 'paper' && scope.paperId !== null) {
    return Promise.resolve(
      new FileStat({
        name: scope.paperId,
        type: FileType.DIRECTORY,
        extra: { paperId: scope.paperId, field: scope.field, year: scope.year },
      }),
    )
  }

  if (scope.level === 'file' && scope.filename !== null) {
    return Promise.resolve(
      new FileStat({
        name: scope.filename,
        type: FILE_TYPES[scope.filename] ?? FileType.TEXT,
        extra: { paperId: scope.paperId, field: scope.field, year: scope.year },
      }),
    )
  }

  return Promise.reject(notFound(spec.original))
}
