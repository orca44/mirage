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
import { getPaper } from './_client.ts'
import { detectScope } from './scope.ts'

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
  const scope = detectScope(spec)
  if (scope.level !== 'file' || scope.paperId === null || scope.filename === null) {
    throw notFound(spec.original)
  }

  const paper = await getPaper(accessor, scope.paperId)

  if (scope.filename === 'meta.json') {
    const meta = {
      paperId: paper.paperId,
      title: paper.title ?? null,
      year: paper.year ?? null,
      venue: paper.venue ?? null,
      publicationDate: paper.publicationDate ?? null,
      externalIds: paper.externalIds ?? null,
      fieldsOfStudy: paper.fieldsOfStudy ?? null,
      citationCount: paper.citationCount ?? null,
      referenceCount: paper.referenceCount ?? null,
      influentialCitationCount: paper.influentialCitationCount ?? null,
      openAccessPdf: paper.openAccessPdf?.url ?? null,
    }
    return ENC.encode(JSON.stringify(meta, null, 2) + '\n')
  }
  if (scope.filename === 'abstract.txt') {
    return ENC.encode((paper.abstract ?? '') + '\n')
  }
  if (scope.filename === 'tldr.txt') {
    return ENC.encode((paper.tldr?.text ?? '') + '\n')
  }
  if (scope.filename === 'authors.json') {
    return ENC.encode(JSON.stringify(paper.authors ?? [], null, 2) + '\n')
  }
  throw notFound(spec.original)
}
