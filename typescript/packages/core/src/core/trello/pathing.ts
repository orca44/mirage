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

const UNSAFE_CHARS = /[^\w\s\-.]/g
const MULTI_UNDERSCORE = /_+/g
const MAX_LEN = 100

export function sanitizeName(name: string): string {
  if (name.trim() === '') return 'unknown'
  let cleaned = name.replace(UNSAFE_CHARS, '_')
  cleaned = cleaned.replace(/ /g, '_')
  cleaned = cleaned.replace(MULTI_UNDERSCORE, '_')
  cleaned = cleaned.replace(/^_+|_+$/g, '')
  if (cleaned.length > MAX_LEN) cleaned = cleaned.slice(0, MAX_LEN)
  if (cleaned === '') return 'unknown'
  return cleaned
}

export function splitSuffixId(name: string, suffix = ''): [string, string] {
  if (suffix !== '' && !name.endsWith(suffix)) {
    throw new Error(`ENOENT: ${name}`)
  }
  const raw = suffix !== '' ? name.slice(0, -suffix.length) : name
  const idx = raw.lastIndexOf('__')
  if (idx === -1) {
    throw new Error(`ENOENT: ${name}`)
  }
  const label = raw.slice(0, idx)
  const id = raw.slice(idx + 2)
  if (id === '') {
    throw new Error(`ENOENT: ${name}`)
  }
  return [label, id]
}

function pickString(record: Record<string, unknown>, ...keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return ''
}

function requireId(record: Record<string, unknown>): string {
  const id = pickString(record, 'id')
  if (id === '') throw new Error('record missing id')
  return id
}

export function workspaceDirname(workspace: Record<string, unknown>): string {
  const label = sanitizeName(pickString(workspace, 'displayName', 'name') || 'workspace')
  return `${label}__${requireId(workspace)}`
}

export function boardDirname(board: Record<string, unknown>): string {
  const label = sanitizeName(pickString(board, 'name') || 'board')
  return `${label}__${requireId(board)}`
}

export function listDirname(lst: Record<string, unknown>): string {
  const label = sanitizeName(pickString(lst, 'name') || 'list')
  return `${label}__${requireId(lst)}`
}

export function cardDirname(card: Record<string, unknown>): string {
  const label = sanitizeName(pickString(card, 'name') || 'card')
  return `${label}__${requireId(card)}`
}

export function memberFilename(member: Record<string, unknown>): string {
  const label = sanitizeName(pickString(member, 'fullName', 'username') || 'member')
  return `${label}__${requireId(member)}.json`
}

export function labelFilename(label: Record<string, unknown>): string {
  const raw = pickString(label, 'name', 'color') || 'label'
  return `${sanitizeName(raw)}__${requireId(label)}.json`
}
