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

import { IndexEntry } from '../../cache/index/config.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import type { PathSpec } from '../../types.ts'
import type { NotionTransport } from './_client.ts'
import { extractIdNoDashes, pageSegmentName } from './normalize.ts'
import { getChildPages, searchTopLevelPages } from './pages.ts'
import { formatSegment, parseSegment } from './pathing.ts'

export interface NotionReaddirAccessor {
  readonly transport: NotionTransport
}

function enoent(path: string): Error {
  const err = new Error(`ENOENT: ${path}`) as Error & { code: string }
  err.code = 'ENOENT'
  return err
}

function pickString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function makeVirtualKey(prefix: string, key: string): string {
  if (key === '') return prefix !== '' ? prefix : '/'
  return `${prefix}/${key}`
}

export async function readdir(
  accessor: NotionReaddirAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): Promise<string[]> {
  const prefix = path.prefix
  let p = path.pattern !== null ? path.directory : path.original
  if (prefix !== '' && p.startsWith(prefix)) {
    p = p.slice(prefix.length) || '/'
  }
  const key = p.replace(/^\/+|\/+$/g, '')
  const virtualKey = makeVirtualKey(prefix, key)

  if (key === '') {
    if (index !== undefined) {
      const listing = await index.listDir(virtualKey)
      if (listing.entries !== undefined && listing.entries !== null) {
        return listing.entries
      }
    }
    const pages = await searchTopLevelPages(accessor.transport)
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    for (const page of pages) {
      const name = pageSegmentName(page)
      const id = extractIdNoDashes(page)
      entries.push([
        name,
        new IndexEntry({
          id,
          name,
          resourceType: 'notion/page',
          remoteTime: pickString(page, 'last_edited_time'),
          vfsName: name,
        }),
      ])
      names.push(`${prefix}/${name}`)
    }
    if (index !== undefined) await index.setDir(virtualKey, entries)
    return names
  }

  const parts = key.split('/')
  const lastSegment = parts[parts.length - 1] ?? ''
  let parsed: { id: string; title: string }
  try {
    parsed = parseSegment(lastSegment)
  } catch {
    throw enoent(p)
  }

  if (index !== undefined) {
    const listing = await index.listDir(virtualKey)
    if (listing.entries !== undefined && listing.entries !== null) {
      return listing.entries
    }
  }

  const refs = await getChildPages(accessor.transport, parsed.id)
  const entries: [string, IndexEntry][] = [
    [
      'page.json',
      new IndexEntry({
        id: '',
        name: 'page.json',
        resourceType: 'notion/page-json',
        remoteTime: '',
        vfsName: 'page.json',
      }),
    ],
  ]
  const names: string[] = [`${prefix}/${key}/page.json`]
  for (const ref of refs) {
    const segment = formatSegment({ id: ref.id, title: ref.title })
    entries.push([
      segment,
      new IndexEntry({
        id: ref.id,
        name: segment,
        resourceType: 'notion/page',
        remoteTime: '',
        vfsName: segment,
      }),
    ])
    names.push(`${prefix}/${key}/${segment}`)
  }
  if (index !== undefined) await index.setDir(virtualKey, entries)
  return names
}
