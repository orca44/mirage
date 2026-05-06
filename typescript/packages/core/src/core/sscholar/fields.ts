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

export const SSCHOLAR_FIELDS: readonly string[] = Object.freeze([
  'Agricultural and Food Sciences',
  'Art',
  'Biology',
  'Business',
  'Chemistry',
  'Computer Science',
  'Economics',
  'Education',
  'Engineering',
  'Environmental Science',
  'Geography',
  'Geology',
  'History',
  'Law',
  'Linguistics',
  'Materials Science',
  'Mathematics',
  'Medicine',
  'Philosophy',
  'Physics',
  'Political Science',
  'Psychology',
  'Sociology',
])

export function fieldToSlug(field: string): string {
  return field.toLowerCase().replace(/\s+/g, '-')
}

export function slugToField(slug: string): string | null {
  for (const f of SSCHOLAR_FIELDS) {
    if (fieldToSlug(f) === slug) return f
  }
  return null
}

export const SSCHOLAR_FIELD_SLUGS: readonly string[] = Object.freeze(
  SSCHOLAR_FIELDS.map(fieldToSlug),
)

const CURRENT_YEAR = new Date().getFullYear()
export const SSCHOLAR_YEARS: readonly string[] = Object.freeze(
  Array.from({ length: CURRENT_YEAR - 1999 }, (_, i) => String(2000 + i)),
)

export const PAPER_FILES: readonly string[] = Object.freeze([
  'meta.json',
  'abstract.txt',
  'tldr.txt',
  'authors.json',
])
