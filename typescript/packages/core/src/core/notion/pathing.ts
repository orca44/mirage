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

const ID_PATTERN = /^[0-9a-f]{32}$/
const TRAILING_ID_PATTERN = /__([0-9a-f]{32})$/

export function sanitizeTitle(title: string): string {
  const trimmed = title.trim()
  if (trimmed === '') return 'untitled'
  return trimmed.replace(/\//g, '-')
}

export function stripDashes(id: string): string {
  return id.replace(/-/g, '')
}

export function formatSegment(page: { id: string; title: string }): string {
  return `${sanitizeTitle(page.title)}__${page.id.toLowerCase()}`
}

export function parseSegment(segment: string): { title: string; id: string } {
  const match = TRAILING_ID_PATTERN.exec(segment)
  if (match === null) {
    throw new Error(`invalid notion segment: ${segment}`)
  }
  const id = match[1] ?? ''
  if (!ID_PATTERN.test(id)) {
    throw new Error(`invalid notion segment: ${segment}`)
  }
  const title = segment.slice(0, segment.length - id.length - 2)
  return { title, id }
}
