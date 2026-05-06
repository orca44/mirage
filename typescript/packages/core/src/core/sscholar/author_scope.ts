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

import { PathSpec } from '../../types.ts'

export type SSCholarAuthorLevel = 'root' | 'author' | 'file' | 'papers' | 'invalid'

export interface SSCholarAuthorScope {
  level: SSCholarAuthorLevel
  authorId: string | null
  filename: string | null
  resourcePath: string
}

export const AUTHOR_FILES: readonly string[] = Object.freeze(['profile.json', 'papers.json'])

export function detectAuthorScope(path: PathSpec | string): SSCholarAuthorScope {
  const raw = path instanceof PathSpec ? path.stripPrefix : path
  const key = raw.replace(/^\/+|\/+$/g, '')
  const empty: SSCholarAuthorScope = {
    level: 'root',
    authorId: null,
    filename: null,
    resourcePath: '/',
  }
  if (key === '') return empty

  const parts = key.split('/')

  if (parts.length === 1) {
    return {
      level: 'author',
      authorId: parts[0] ?? '',
      filename: null,
      resourcePath: raw,
    }
  }

  if (parts.length === 2) {
    const filename = parts[1] ?? ''
    if (!AUTHOR_FILES.includes(filename)) {
      return { ...empty, level: 'invalid', resourcePath: raw }
    }
    return {
      level: 'file',
      authorId: parts[0] ?? '',
      filename,
      resourcePath: raw,
    }
  }

  return { ...empty, level: 'invalid', resourcePath: raw }
}
