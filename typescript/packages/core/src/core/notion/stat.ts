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

import type { IndexCacheStore } from '../../cache/index/store.ts'
import { FileStat, FileType, type PathSpec } from '../../types.ts'
import type { NotionTransport } from './_client.ts'
import { getPage } from './pages.ts'
import { parseSegment } from './pathing.ts'

export interface NotionStatAccessor {
  readonly transport: NotionTransport
}

function enoent(path: string): Error {
  const err = new Error(`ENOENT: ${path}`) as Error & { code: string }
  err.code = 'ENOENT'
  return err
}

function makeVirtualKey(prefix: string, key: string): string {
  if (key === '') return prefix !== '' ? prefix : '/'
  return `${prefix}/${key}`
}

function pickString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

async function resolveModified(
  transport: NotionTransport,
  index: IndexCacheStore | undefined,
  cacheKey: string,
  pageId: string,
): Promise<string | null> {
  if (index !== undefined) {
    const result = await index.get(cacheKey)
    const cached = result.entry?.remoteTime
    if (typeof cached === 'string' && cached !== '') return cached
  }
  const page = await getPage(transport, pageId)
  const time = pickString(page, 'last_edited_time')
  return time === '' ? null : time
}

export async function stat(
  accessor: NotionStatAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): Promise<FileStat> {
  const prefix = path.prefix
  let p = path.original
  if (prefix !== '' && p.startsWith(prefix)) {
    p = p.slice(prefix.length) || '/'
  }
  const key = p.replace(/^\/+|\/+$/g, '')
  const virtualKey = makeVirtualKey(prefix, key)

  if (key === '') {
    return new FileStat({ name: '/', type: FileType.DIRECTORY })
  }

  const parts = key.split('/')
  const lastSegment = parts[parts.length - 1] ?? ''

  if (lastSegment === 'page.json') {
    if (parts.length < 2) throw enoent(path.original)
    const parentSegment = parts[parts.length - 2] ?? ''
    let parsed: { id: string; title: string }
    try {
      parsed = parseSegment(parentSegment)
    } catch {
      throw enoent(path.original)
    }
    const parentVirtualKey = makeVirtualKey(prefix, parts.slice(0, parts.length - 1).join('/'))
    const modified = await resolveModified(accessor.transport, index, parentVirtualKey, parsed.id)
    return new FileStat({
      name: 'page.json',
      type: FileType.JSON,
      modified,
      size: null,
      extra: { page_id: parsed.id },
    })
  }

  let parsed: { id: string; title: string }
  try {
    parsed = parseSegment(lastSegment)
  } catch {
    throw enoent(path.original)
  }
  const modified = await resolveModified(accessor.transport, index, virtualKey, parsed.id)
  return new FileStat({
    name: lastSegment,
    type: FileType.DIRECTORY,
    modified,
    size: null,
    extra: { page_id: parsed.id },
  })
}
