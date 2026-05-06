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

import type { PathSpec } from '../../types.ts'

export interface GmailScope {
  useNative: boolean
  labelName: string | null
  dateStr: string | null
  resourcePath: string
}

export function detectScope(path: PathSpec): GmailScope {
  const prefix = path.prefix || ''

  if (path.pattern?.endsWith('.gmail.json')) {
    let dirKey = path.directory.replace(/^\/+|\/+$/g, '')
    const trimmedPrefix = prefix.replace(/^\/+|\/+$/g, '')
    if (trimmedPrefix !== '' && dirKey.startsWith(`${trimmedPrefix}/`)) {
      dirKey = dirKey.slice(trimmedPrefix.length + 1)
    }
    const parts = dirKey === '' ? [] : dirKey.split('/')
    if (parts.length === 2) {
      return {
        useNative: true,
        labelName: parts[0] ?? null,
        dateStr: parts[1] ?? null,
        resourcePath: dirKey,
      }
    }
  }

  const key = path.key
  if (key === '') {
    return { useNative: true, labelName: null, dateStr: null, resourcePath: '/' }
  }

  const parts = key.split('/')
  if (parts.length === 1) {
    return {
      useNative: true,
      labelName: parts[0] ?? null,
      dateStr: null,
      resourcePath: key,
    }
  }
  if (parts.length === 2) {
    return {
      useNative: true,
      labelName: parts[0] ?? null,
      dateStr: parts[1] ?? null,
      resourcePath: key,
    }
  }
  return {
    useNative: false,
    labelName: parts[0] ?? null,
    dateStr: parts.length >= 2 ? (parts[1] ?? null) : null,
    resourcePath: key,
  }
}
