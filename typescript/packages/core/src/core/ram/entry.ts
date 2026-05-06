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

export const RAMResourceType = Object.freeze({
  FILE: 'file',
  FOLDER: 'folder',
} as const)

export type RAMResourceType = (typeof RAMResourceType)[keyof typeof RAMResourceType]

export class RAMIndexEntry extends IndexEntry {
  static file(path: string, size = 0): RAMIndexEntry {
    const name = path.slice(path.lastIndexOf('/') + 1)
    return new RAMIndexEntry({
      id: path,
      name,
      resourceType: RAMResourceType.FILE,
      vfsName: name,
      size,
    })
  }

  static folder(path: string): RAMIndexEntry {
    const name = path.slice(path.lastIndexOf('/') + 1)
    return new RAMIndexEntry({
      id: path,
      name,
      resourceType: RAMResourceType.FOLDER,
      vfsName: name,
    })
  }
}
