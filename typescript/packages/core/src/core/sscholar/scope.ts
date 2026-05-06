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
import { PAPER_FILES, SSCHOLAR_FIELD_SLUGS, SSCHOLAR_YEARS, slugToField } from './fields.ts'

export type SSCholarPaperLevel = 'root' | 'field' | 'year' | 'paper' | 'file' | 'invalid'

export interface SSCholarPaperScope {
  level: SSCholarPaperLevel
  fieldSlug: string | null
  field: string | null
  year: string | null
  paperId: string | null
  filename: string | null
  resourcePath: string
}

export function detectScope(path: PathSpec | string): SSCholarPaperScope {
  const raw = path instanceof PathSpec ? path.stripPrefix : path
  const key = raw.replace(/^\/+|\/+$/g, '')
  const empty: SSCholarPaperScope = {
    level: 'root',
    fieldSlug: null,
    field: null,
    year: null,
    paperId: null,
    filename: null,
    resourcePath: '/',
  }
  if (key === '') return empty

  const parts = key.split('/')
  const part0 = parts[0] ?? ''
  if (!SSCHOLAR_FIELD_SLUGS.includes(part0)) {
    return { ...empty, level: 'invalid', resourcePath: raw }
  }
  const field = slugToField(part0)

  if (parts.length === 1) {
    return {
      level: 'field',
      fieldSlug: part0,
      field,
      year: null,
      paperId: null,
      filename: null,
      resourcePath: raw,
    }
  }

  const part1 = parts[1] ?? ''
  if (!SSCHOLAR_YEARS.includes(part1)) {
    return { ...empty, level: 'invalid', resourcePath: raw }
  }

  if (parts.length === 2) {
    return {
      level: 'year',
      fieldSlug: part0,
      field,
      year: part1,
      paperId: null,
      filename: null,
      resourcePath: raw,
    }
  }

  const paperId = parts[2] ?? ''
  if (parts.length === 3) {
    return {
      level: 'paper',
      fieldSlug: part0,
      field,
      year: part1,
      paperId,
      filename: null,
      resourcePath: raw,
    }
  }

  if (parts.length === 4) {
    const filename = parts[3] ?? ''
    if (!PAPER_FILES.includes(filename)) {
      return { ...empty, level: 'invalid', resourcePath: raw }
    }
    return {
      level: 'file',
      fieldSlug: part0,
      field,
      year: part1,
      paperId,
      filename,
      resourcePath: raw,
    }
  }

  return { ...empty, level: 'invalid', resourcePath: raw }
}
