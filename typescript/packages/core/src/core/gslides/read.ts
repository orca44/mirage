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

import type { GSlidesAccessor } from '../../accessor/gslides.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { PathSpec } from '../../types.ts'
import { SLIDES_API_BASE, type TokenManager, googleGet } from '../google/_client.ts'
import { readdir } from './readdir.ts'

const ENC = new TextEncoder()

function enoent(p: string): Error {
  const e = new Error(`ENOENT: ${p}`) as Error & { code: string }
  e.code = 'ENOENT'
  return e
}

function eisdir(p: string): Error {
  const e = new Error(`EISDIR: ${p}`) as Error & { code: string }
  e.code = 'EISDIR'
  return e
}

export async function readPresentation(
  tm: TokenManager,
  presentationId: string,
): Promise<Uint8Array> {
  const url = `${SLIDES_API_BASE}/presentations/${presentationId}`
  const data = await googleGet(tm, url)
  return ENC.encode(JSON.stringify(data))
}

export async function read(
  accessor: GSlidesAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): Promise<Uint8Array> {
  const prefix = path.prefix
  let p = path.original
  if (prefix !== '' && p.startsWith(prefix)) p = p.slice(prefix.length) || '/'
  const key = p.replace(/^\/+|\/+$/g, '')
  if (index === undefined) throw enoent(path.original)
  const virtualKey = prefix !== '' ? `${prefix}/${key}` : `/${key}`
  let result = await index.get(virtualKey)
  if (result.entry === undefined || result.entry === null) {
    const parentKey = virtualKey.replace(/\/+$/, '').replace(/\/[^/]+$/, '') || '/'
    if (parentKey !== virtualKey) {
      const parentPath = PathSpec.fromStrPath(parentKey, prefix)
      try {
        await readdir(accessor, parentPath, index)
        result = await index.get(virtualKey)
      } catch {
        // parent refresh failed; fall through to ENOENT
      }
    }
    if (result.entry === undefined || result.entry === null) throw enoent(path.original)
  }
  if (result.entry.resourceType === 'gslides/directory') throw eisdir(path.original)
  return readPresentation(accessor.tokenManager, result.entry.id)
}

export async function* stream(
  accessor: GSlidesAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): AsyncIterable<Uint8Array> {
  yield await read(accessor, path, index)
}
