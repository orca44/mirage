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

import type { GitHubAccessor } from '../../accessor/github.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { FileStat, FileType, PathSpec } from '../../types.ts'
import { getExtension } from '../../commands/resolve.ts'
import { readdir as coreReaddir } from './readdir.ts'

function enoent(path: string): Error {
  const e = new Error(`ENOENT: ${path}`) as Error & { code: string }
  e.code = 'ENOENT'
  return e
}

function stripPrefix(path: PathSpec): string {
  const prefix = path.prefix
  let p = path.original
  if (prefix !== '' && p.startsWith(prefix)) {
    p = p.slice(prefix.length) || '/'
  }
  return p
}

function indexKey(p: string): string {
  const trimmed = p.replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? '/' : `/${trimmed}`
}

function guessFileType(name: string): FileType {
  const ext = getExtension(name)
  if (ext === 'json') return FileType.JSON
  if (ext === 'csv') return FileType.CSV
  return FileType.TEXT
}

export async function stat(
  accessor: GitHubAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): Promise<FileStat> {
  const prefix = path.prefix
  const p = stripPrefix(path)
  const trimmed = p.replace(/^\/+|\/+$/g, '')
  if (trimmed === '') {
    return new FileStat({ name: '/', type: FileType.DIRECTORY })
  }
  if (index === undefined) throw enoent(p)
  const ikey = indexKey(p)
  let result = await index.get(ikey)
  if (result.entry === undefined || result.entry === null) {
    const parentIdx = ikey.includes('/') ? ikey.slice(0, ikey.lastIndexOf('/')) || '/' : '/'
    const parentPath = prefix !== '' ? prefix + parentIdx : parentIdx
    try {
      await coreReaddir(
        accessor,
        new PathSpec({
          original: parentPath,
          directory: parentPath,
          resolved: false,
          prefix,
        }),
        index,
      )
    } catch {
      // parent listing failed — fall through
    }
    result = await index.get(ikey)
    if (result.entry === undefined || result.entry === null) throw enoent(p)
  }
  if (result.entry.resourceType === 'folder') {
    return new FileStat({ name: result.entry.name, type: FileType.DIRECTORY })
  }
  return new FileStat({
    name: result.entry.name,
    size: result.entry.size,
    type: guessFileType(result.entry.name),
    fingerprint: result.entry.id,
    extra: { sha: result.entry.id },
  })
}
