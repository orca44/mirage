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

import { IndexEntry, type IndexEntryInit, ResourceType } from '../../cache/index/config.ts'

export interface S3IndexEntryInit extends IndexEntryInit {
  etag?: string
}

export interface S3Object {
  Key?: string
  Size?: number | null
  LastModified?: Date | string | undefined
  ETag?: string
}

export class S3IndexEntry extends IndexEntry {
  etag: string

  constructor(init: S3IndexEntryInit) {
    super(init)
    this.etag = init.etag ?? ''
  }

  static fromObject(obj: S3Object): S3IndexEntry {
    const key = obj.Key ?? ''
    const name = key.replace(/\/+$/, '').split('/').pop() ?? ''
    const modified = obj.LastModified
    const remoteTime =
      modified instanceof Date
        ? modified.toISOString()
        : typeof modified === 'string'
          ? modified
          : ''
    return new S3IndexEntry({
      id: key,
      name,
      resourceType: ResourceType.FILE,
      vfsName: name,
      size: obj.Size ?? null,
      remoteTime,
      etag: obj.ETag ?? '',
    })
  }

  static fromPrefix(prefix: string): S3IndexEntry {
    const name = prefix.replace(/\/+$/, '').split('/').pop() ?? ''
    return new S3IndexEntry({
      id: prefix,
      name,
      resourceType: ResourceType.FOLDER,
      vfsName: name,
    })
  }
}
