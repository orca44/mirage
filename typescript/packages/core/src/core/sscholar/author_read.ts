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
import { PathSpec } from '../../types.ts'
import { getAuthor, getAuthorPapers } from './author_client.ts'
import { detectAuthorScope } from './author_scope.ts'

const ENC = new TextEncoder()

function notFound(p: string): Error {
  const err = new Error(p) as Error & { code?: string }
  err.code = 'ENOENT'
  return err
}

export async function read(
  accessor: SSCholarAccessor,
  path: PathSpec | string,
  _index?: IndexCacheStore,
): Promise<Uint8Array> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const scope = detectAuthorScope(spec)
  if (scope.level !== 'file' || scope.authorId === null || scope.filename === null) {
    throw notFound(spec.original)
  }

  if (scope.filename === 'profile.json') {
    const profile = await getAuthor(accessor, scope.authorId)
    return ENC.encode(JSON.stringify(profile, null, 2) + '\n')
  }

  if (scope.filename === 'papers.json') {
    const result = await getAuthorPapers(accessor, scope.authorId)
    return ENC.encode(JSON.stringify(result.data, null, 2) + '\n')
  }

  throw notFound(spec.original)
}
