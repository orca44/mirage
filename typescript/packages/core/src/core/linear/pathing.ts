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
  if (idx === -1) throw new Error(`ENOENT: ${name}`)
  const label = raw.slice(0, idx)
  const id = raw.slice(idx + 2)
  if (id === '') throw new Error(`ENOENT: ${name}`)
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

export function teamDirname(team: Record<string, unknown>): string {
  const parts: string[] = []
  const key = pickString(team, 'key')
  if (key !== '') parts.push(sanitizeName(key))
  const name = pickString(team, 'name')
  if (name !== '') {
    const sanitized = sanitizeName(name)
    if (!parts.includes(sanitized)) parts.push(sanitized)
  }
  if (parts.length === 0) parts.push('team')
  return `${parts.join('__')}__${requireId(team)}`
}

export function memberFilename(user: Record<string, unknown>): string {
  const label = sanitizeName(pickString(user, 'displayName', 'name', 'email') || 'user')
  return `${label}__${requireId(user)}.json`
}

export function issueDirname(issue: Record<string, unknown>): string {
  const key = pickString(issue, 'identifier', 'id') || 'issue'
  return `${sanitizeName(key)}__${requireId(issue)}`
}

export function projectFilename(project: Record<string, unknown>): string {
  const label = sanitizeName(pickString(project, 'name') || 'project')
  return `${label}__${requireId(project)}.json`
}

export function cycleFilename(cycle: Record<string, unknown>): string {
  const label = sanitizeName(pickString(cycle, 'name') || 'cycle')
  return `${label}__${requireId(cycle)}.json`
}
