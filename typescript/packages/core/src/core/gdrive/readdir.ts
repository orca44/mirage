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

import type { GDriveAccessor } from '../../accessor/gdrive.ts'
import { IndexEntry } from '../../cache/index/config.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { PathSpec } from '../../types.ts'
import { MIME_TO_EXT, listFiles } from '../google/drive.ts'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const DOC_MIME = 'application/vnd.google-apps.document'
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const SLIDE_MIME = 'application/vnd.google-apps.presentation'

function resourceTypeFor(mime: string): string {
  if (mime === FOLDER_MIME) return 'gdrive/folder'
  if (mime === DOC_MIME) return 'gdrive/gdoc'
  if (mime === SHEET_MIME) return 'gdrive/gsheet'
  if (mime === SLIDE_MIME) return 'gdrive/gslide'
  return 'gdrive/file'
}

export async function readdir(
  accessor: GDriveAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): Promise<string[]> {
  const prefix = path.prefix
  const raw = path.pattern !== null ? path.directory : path.original
  let p = raw
  if (prefix !== '' && p.startsWith(prefix)) p = p.slice(prefix.length) || '/'
  const key = p.replace(/^\/+|\/+$/g, '')
  const virtualKey = key !== '' ? `${prefix}/${key}` : prefix !== '' ? prefix : '/'

  if (index !== undefined) {
    const cached = await index.listDir(virtualKey)
    if (cached.entries !== undefined && cached.entries !== null) return cached.entries
  }

  let folderId: string
  if (key === '') {
    folderId = 'root'
  } else {
    if (index === undefined) {
      const e = new Error(`ENOENT: ${path.original}`) as Error & { code: string }
      e.code = 'ENOENT'
      throw e
    }
    let result = await index.get(virtualKey)
    if (result.entry === undefined || result.entry === null) {
      const parentOriginal = path.original.replace(/\/+$/, '').replace(/\/[^/]+$/, '') || '/'
      if (parentOriginal !== path.original) {
        const parentPath = PathSpec.fromStrPath(parentOriginal, prefix)
        await readdir(accessor, parentPath, index)
        result = await index.get(virtualKey)
      }
      if (result.entry === undefined || result.entry === null) {
        const e = new Error(`ENOENT: ${path.original}`) as Error & { code: string }
        e.code = 'ENOENT'
        throw e
      }
    }
    folderId = result.entry.id
  }

  const files = await listFiles(accessor.tokenManager, { folderId })
  const entries: { name: string; entry: IndexEntry; isDir: boolean }[] = []
  for (const f of files) {
    const mime = f.mimeType ?? ''
    const ext = MIME_TO_EXT[mime] ?? ''
    const filename = ext !== '' ? `${f.name}${ext}` : f.name
    const isDir = mime === FOLDER_MIME
    const sizeRaw = f.size ?? f.quotaBytesUsed ?? '0'
    const sizeNum = Number.parseInt(sizeRaw, 10)
    const entry = new IndexEntry({
      id: f.id,
      name: f.name,
      resourceType: resourceTypeFor(mime),
      remoteTime: f.modifiedTime ?? '',
      vfsName: filename,
      size: Number.isFinite(sizeNum) && sizeNum > 0 ? sizeNum : null,
    })
    entries.push({ name: filename, entry, isDir })
  }

  if (index !== undefined) {
    await index.setDir(
      virtualKey,
      entries.map((e) => [e.name, e.entry] as [string, IndexEntry]),
    )
  }
  const pathPrefix = key !== '' ? `/${key}/` : '/'
  const out: string[] = []
  for (const e of entries) {
    if (e.isDir) out.push(`${prefix}${pathPrefix}${e.name}/`)
    else out.push(`${prefix}${pathPrefix}${e.name}`)
  }
  return out
}
