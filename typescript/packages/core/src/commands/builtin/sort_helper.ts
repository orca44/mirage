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

const HUMAN_SUFFIXES: Record<string, number> = {
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const VERSION_RE = /(\d+)|(\D+)/g

function parseHuman(s: string): number {
  const trimmed = s.trim()
  if (trimmed === '') return 0
  const suffix = trimmed[trimmed.length - 1]?.toUpperCase() ?? ''
  if (suffix in HUMAN_SUFFIXES) {
    const n = Number.parseFloat(trimmed.slice(0, -1))
    if (Number.isNaN(n)) return 0
    return n * (HUMAN_SUFFIXES[suffix] ?? 1)
  }
  const n = Number.parseFloat(trimmed)
  return Number.isNaN(n) ? 0 : n
}

export type SortKey = string | number | (string | number)[]

function versionKey(s: string): SortKey {
  const parts: (string | number)[] = []
  let m: RegExpExecArray | null
  VERSION_RE.lastIndex = 0
  while ((m = VERSION_RE.exec(s)) !== null) {
    if (m[1] !== undefined) {
      parts.push(0, Number.parseInt(m[1], 10))
    } else if (m[2] !== undefined) {
      parts.push(1, m[2])
    }
  }
  return parts
}

export interface SortKeyOptions {
  keyField: number | null
  fieldSep: string | null
  ignoreCase: boolean
  numeric: boolean
  humanNumeric: boolean
  version: boolean
  month: boolean
}

export function sortKey(line: string, opts: SortKeyOptions): SortKey {
  let field: string
  if (opts.keyField !== null) {
    const parts =
      opts.fieldSep !== null && opts.fieldSep !== ''
        ? line.split(opts.fieldSep)
        : line.split(/\s+/).filter((p) => p !== '')
    field = opts.keyField - 1 < parts.length ? (parts[opts.keyField - 1] ?? '') : ''
  } else {
    field = line
  }
  if (opts.ignoreCase) {
    const fieldLower = field.toLowerCase()
    if (!opts.numeric && !opts.humanNumeric && !opts.version && !opts.month) {
      return [fieldLower, field]
    }
    field = fieldLower
  }
  if (opts.month) {
    const abbr = field.trim().slice(0, 3).toLowerCase()
    return MONTHS[abbr] ?? 0
  }
  if (opts.humanNumeric) return parseHuman(field)
  if (opts.version) return versionKey(field)
  if (opts.numeric) {
    const trimmed = field.replace(/^\s+/, '')
    let numEnd = 0
    for (const ch of trimmed) {
      if (/\d/.test(ch) || ((ch === '.' || ch === '+' || ch === '-') && numEnd === 0)) numEnd += 1
      else break
    }
    if (numEnd === 0) return 0
    const n = Number.parseFloat(trimmed.slice(0, numEnd))
    return Number.isNaN(n) ? 0 : n
  }
  return field
}

export function compareKeys(a: SortKey, b: SortKey): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.min(a.length, b.length)
    for (let i = 0; i < len; i++) {
      const cmp = compareKeys(a[i] ?? '', b[i] ?? '')
      if (cmp !== 0) return cmp
    }
    return a.length - b.length
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = String(a)
  const sb = String(b)
  if (sa < sb) return -1
  if (sa > sb) return 1
  return 0
}
