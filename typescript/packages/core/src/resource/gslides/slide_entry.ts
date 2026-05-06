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

const TITLE_MAX_CHARS = 100
const UNSAFE_CHARS = /[^\w\s\-.]/g
const MULTI_UNDERSCORE = /_+/g

export interface SlideEntry {
  id: string
  name: string
  modifiedTime: string
  createdTime: string
  owner: string | null
  ownedByMe: boolean
  canEdit: boolean
  filename: string
}

export function sanitizeTitle(title: string): string {
  if (title.trim() === '') return 'Untitled'
  let cleaned = title.replace(UNSAFE_CHARS, '_')
  cleaned = cleaned.replace(/ /g, '_')
  cleaned = cleaned.replace(MULTI_UNDERSCORE, '_')
  cleaned = cleaned.replace(/^_+|_+$/g, '')
  if (cleaned.length > TITLE_MAX_CHARS) {
    cleaned = cleaned.slice(0, TITLE_MAX_CHARS - 3) + '...'
  }
  return cleaned
}

export function makeFilename(title: string, docId: string, modifiedTime = ''): string {
  const datePrefix = modifiedTime.length >= 10 ? modifiedTime.slice(0, 10) : ''
  if (datePrefix !== '') {
    return `${datePrefix}_${sanitizeTitle(title)}__${docId}.gslide.json`
  }
  return `${sanitizeTitle(title)}__${docId}.gslide.json`
}
