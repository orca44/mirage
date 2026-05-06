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

import type { DropboxAccessor } from '../../accessor/dropbox.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { PathSpec } from '../../types.ts'
import { dropboxDownload, dropboxDownloadStream } from './_client.ts'
import { readdir } from './readdir.ts'

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

function dropboxPathFromVirtual(virtualKey: string, prefix: string): string {
  let key = virtualKey
  if (prefix !== '' && key.startsWith(prefix)) key = key.slice(prefix.length)
  key = key.replace(/^\/+|\/+$/g, '')
  return key === '' ? '' : `/${key}`
}

export async function read(
  accessor: DropboxAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): Promise<Uint8Array> {
  const prefix = path.prefix
  let p = path.original
  if (prefix !== '' && p.startsWith(prefix)) p = p.slice(prefix.length) || '/'
  const key = p.replace(/^\/+|\/+$/g, '')
  if (key === '') throw eisdir(path.original)
  const virtualKey = prefix !== '' ? `${prefix}/${key}` : `/${key}`

  let entry = index !== undefined ? (await index.get(virtualKey)).entry : null
  if (entry === undefined || entry === null) {
    if (index !== undefined) {
      const parentKey = virtualKey.replace(/\/+$/, '').replace(/\/[^/]+$/, '') || '/'
      if (parentKey !== virtualKey) {
        const parentPath = PathSpec.fromStrPath(parentKey, prefix)
        try {
          await readdir(accessor, parentPath, index)
          entry = (await index.get(virtualKey)).entry ?? null
        } catch {
          // parent refresh failed; fall through to ENOENT
        }
      }
    }
    if (entry === undefined || entry === null) throw enoent(path.original)
  }
  if (entry.resourceType === 'dropbox/folder') throw eisdir(path.original)
  const dropboxPath = dropboxPathFromVirtual(virtualKey, prefix)
  return dropboxDownload(accessor.tokenManager, dropboxPath)
}

export async function* stream(
  accessor: DropboxAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): AsyncIterable<Uint8Array> {
  const prefix = path.prefix
  let p = path.original
  if (prefix !== '' && p.startsWith(prefix)) p = p.slice(prefix.length) || '/'
  const key = p.replace(/^\/+|\/+$/g, '')
  if (key === '') throw eisdir(path.original)
  const virtualKey = prefix !== '' ? `${prefix}/${key}` : `/${key}`

  let entry = index !== undefined ? (await index.get(virtualKey)).entry : null
  if (entry === undefined || entry === null) {
    if (index !== undefined) {
      const parentKey = virtualKey.replace(/\/+$/, '').replace(/\/[^/]+$/, '') || '/'
      if (parentKey !== virtualKey) {
        const parentPath = PathSpec.fromStrPath(parentKey, prefix)
        try {
          await readdir(accessor, parentPath, index)
          entry = (await index.get(virtualKey)).entry ?? null
        } catch {
          // parent refresh failed; fall through to ENOENT
        }
      }
    }
    if (entry === undefined || entry === null) throw enoent(path.original)
  }
  if (entry.resourceType === 'dropbox/folder') throw eisdir(path.original)
  const dropboxPath = dropboxPathFromVirtual(virtualKey, prefix)
  for await (const chunk of dropboxDownloadStream(accessor.tokenManager, dropboxPath)) {
    yield chunk
  }
}

export { dropboxPathFromVirtual }
