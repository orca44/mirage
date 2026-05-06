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

import { FileStat, FileType, guessType, type PathSpec } from '@struktoai/mirage-core'
import { isNotFound, resolveDirHandle, resolveParentDirHandle, splitSegments } from './utils.ts'

export async function stat(root: FileSystemDirectoryHandle, p: PathSpec): Promise<FileStat> {
  const virtual = p.stripPrefix
  const segs = splitSegments(virtual)
  const last = segs.at(-1)
  if (last === undefined) {
    return new FileStat({
      name: '/',
      size: null,
      modified: null,
      type: FileType.DIRECTORY,
    })
  }
  const name = last
  let parentDir: FileSystemDirectoryHandle
  let entryName: string
  try {
    ;[parentDir, entryName] = await resolveParentDirHandle(root, virtual, { create: false })
  } catch (err) {
    if (isNotFound(err)) throw new Error(`file not found: ${virtual}`)
    throw err
  }
  try {
    const fileHandle = await parentDir.getFileHandle(entryName, { create: false })
    const file = await fileHandle.getFile()
    const modified = new Date(file.lastModified).toISOString()
    return new FileStat({
      name,
      size: file.size,
      modified,
      fingerprint: modified,
      type: guessType(name),
    })
  } catch (err) {
    if (!isNotFound(err) && !(err instanceof DOMException && err.name === 'TypeMismatchError')) {
      throw err
    }
  }
  try {
    await resolveDirHandle(root, virtual, { create: false })
    return new FileStat({
      name,
      size: null,
      modified: null,
      type: FileType.DIRECTORY,
    })
  } catch (err) {
    if (isNotFound(err)) throw new Error(`file not found: ${virtual}`)
    throw err
  }
}
