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

import type { FileStat, PathSpec } from '../../types.ts'
import { FileType } from '../../types.ts'
import { getExtension } from '../resolve.ts'
import { compilePattern, grepLines } from './grep_helper.ts'

export const TYPE_EXTENSIONS: Record<string, string[]> = {
  py: ['.py'],
  js: ['.js', '.jsx'],
  ts: ['.ts', '.tsx'],
  java: ['.java'],
  go: ['.go'],
  rs: ['.rs'],
  rb: ['.rb'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.hpp', '.cc', '.cxx'],
  css: ['.css'],
  html: ['.html', '.htm'],
  json: ['.json'],
  yaml: ['.yaml', '.yml'],
  toml: ['.toml'],
  md: ['.md'],
  txt: ['.txt'],
  xml: ['.xml'],
  sql: ['.sql'],
  sh: ['.sh', '.bash'],
  csv: ['.csv'],
}

export type AsyncReaddirFn = (path: string) => Promise<string[]>
export type AsyncStatFn = (path: string) => Promise<FileStat>
export type AsyncReadBytesFn = (path: string) => Promise<Uint8Array>

export interface RgFilterOptions {
  fileType: string | null
  globPattern: string | null
  hidden: boolean
}

function basename(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

function fnmatch(name: string, pattern: string): boolean {
  // Convert shell glob to regex
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '.')
    .replace(/\*/g, '.*')
  return new RegExp(`^${re}$`).test(name)
}

export function rgMatchesFilter(
  entry: string,
  fileType: string | null,
  globPattern: string | null,
  hidden: boolean,
): boolean {
  const base = basename(entry)
  if (!hidden && base.startsWith('.')) return false
  if (fileType !== null) {
    const exts = TYPE_EXTENSIONS[fileType] ?? [`.${fileType}`]
    if (!exts.some((ext) => entry.endsWith(ext))) return false
  }
  if (globPattern !== null && !fnmatch(base, globPattern)) return false
  return true
}

export interface RgFullOptions {
  ignoreCase: boolean
  invert: boolean
  lineNumbers: boolean
  countOnly: boolean
  filesOnly: boolean
  fixedString: boolean
  onlyMatching: boolean
  maxCount: number | null
  wholeWord: boolean
  contextBefore: number
  contextAfter: number
  fileType: string | null
  globPattern: string | null
  hidden: boolean
}

function searchFile(
  data: string[],
  compiled: RegExp,
  opts: RgFullOptions,
  prefixPath: string | null,
): string[] {
  const count = { n: 0 }
  const globalRe = opts.onlyMatching
    ? new RegExp(
        compiled.source,
        compiled.flags.includes('g') ? compiled.flags : compiled.flags + 'g',
      )
    : compiled
  const results: string[] = []
  for (let i = 0; i < data.length; i++) {
    const line = data[i] ?? ''
    const m = globalRe.exec(line)
    globalRe.lastIndex = 0
    const matched = Boolean(m) !== opts.invert
    if (!matched) continue
    count.n += 1
    if (opts.filesOnly) {
      if (prefixPath !== null) return [prefixPath]
      return ['']
    }
    const lineNo = i + 1
    let text: string
    if (opts.onlyMatching && m !== null && !opts.invert) {
      text = m[0]
    } else {
      text = line
    }
    const out = opts.lineNumbers ? `${String(lineNo)}:${text}` : text
    results.push(prefixPath !== null ? `${prefixPath}:${out}` : out)
    if (opts.maxCount !== null && count.n >= opts.maxCount) break
  }
  if (opts.countOnly) {
    return [String(count.n)]
  }
  return results
}

export async function rgFull(
  readdirFn: AsyncReaddirFn,
  statFn: AsyncStatFn,
  readBytesFn: AsyncReadBytesFn,
  path: string,
  pattern: string,
  opts: RgFullOptions,
  warnings: string[] | null,
): Promise<string[]> {
  const compiled = compilePattern(pattern, opts.ignoreCase, opts.fixedString, opts.wholeWord)

  let isDir = false
  try {
    const s = await statFn(path)
    isDir = s.type === FileType.DIRECTORY
  } catch {
    try {
      await readdirFn(path)
      isDir = true
    } catch {
      // not readable
    }
  }

  const DEC = new TextDecoder('utf-8', { fatal: false })

  if (!isDir) {
    if (!rgMatchesFilter(path, opts.fileType, opts.globPattern, opts.hidden)) return []
    let data: string[]
    try {
      const raw = await readBytesFn(path)
      data = DEC.decode(raw).split('\n')
      if (data.length > 0 && data[data.length - 1] === '') data.pop()
    } catch (err) {
      if (warnings !== null) warnings.push(`rg: ${path}: ${String(err)}`)
      return []
    }
    return searchFile(data, compiled, opts, null)
  }

  const results: string[] = []
  let entries: string[]
  try {
    entries = await readdirFn(path)
  } catch (err) {
    if (warnings !== null) warnings.push(`rg: ${path}: ${String(err)}`)
    return results
  }

  for (const entry of entries) {
    let s: FileStat
    try {
      s = await statFn(entry)
    } catch (err) {
      if (warnings !== null) warnings.push(`rg: ${entry}: ${String(err)}`)
      continue
    }

    if (s.type === FileType.DIRECTORY) {
      const base = basename(entry)
      if (!opts.hidden && base.startsWith('.')) continue
      const sub = await rgFull(readdirFn, statFn, readBytesFn, entry, pattern, opts, warnings)
      results.push(...sub)
      continue
    }

    if (!rgMatchesFilter(entry, opts.fileType, opts.globPattern, opts.hidden)) continue

    let data: string[]
    try {
      const raw = await readBytesFn(entry)
      data = DEC.decode(raw).split('\n')
      if (data.length > 0 && data[data.length - 1] === '') data.pop()
    } catch (err) {
      if (warnings !== null) warnings.push(`rg: ${entry}: ${String(err)}`)
      continue
    }
    const fileResults = searchFile(data, compiled, opts, entry)
    results.push(...fileResults)
  }

  return results
}

export type FiletypeFn = (
  paths: PathSpec[],
  pattern: string,
  opts: { stdin: null; ignoreCase: boolean },
) => Promise<[AsyncIterable<Uint8Array> | Uint8Array | null, unknown]>

export interface RgFolderFiletypeOptions {
  ignoreCase: boolean
  invert: boolean
  lineNumbers: boolean
  countOnly: boolean
  filesOnly: boolean
  onlyMatching: boolean
  maxCount: number | null
  fixedString: boolean
  wholeWord: boolean
  fileType: string | null
  globPattern: string | null
  hidden: boolean
}

export async function rgFolderFiletype(
  readdirFn: AsyncReaddirFn,
  statFn: AsyncStatFn,
  readBytesFn: AsyncReadBytesFn,
  path: string,
  pattern: string,
  filetypeFns: Record<string, FiletypeFn>,
  opts: RgFolderFiletypeOptions,
  warnings: string[] | null,
): Promise<string[]> {
  const results: string[] = []
  let entries: string[]
  try {
    entries = await readdirFn(path)
  } catch (err) {
    if (warnings !== null) warnings.push(`rg: ${path}: ${String(err)}`)
    return results
  }

  const pat = compilePattern(pattern, opts.ignoreCase, opts.fixedString, opts.wholeWord)
  const DEC = new TextDecoder('utf-8', { fatal: false })

  for (const entry of entries) {
    let s: FileStat
    try {
      s = await statFn(entry)
    } catch (err) {
      if (warnings !== null) warnings.push(`rg: ${entry}: ${String(err)}`)
      continue
    }

    if (s.type === FileType.DIRECTORY) {
      const sub = await rgFolderFiletype(
        readdirFn,
        statFn,
        readBytesFn,
        entry,
        pattern,
        filetypeFns,
        opts,
        warnings,
      )
      results.push(...sub)
      continue
    }

    if (!rgMatchesFilter(entry, opts.fileType, opts.globPattern, opts.hidden)) continue

    const ext = getExtension(entry)
    const filetypeFn = ext !== null ? filetypeFns[ext] : undefined
    if (filetypeFn !== undefined) {
      // Filetype-specific extraction path (feather/parquet/hdf5 etc.)
      // Skipped here; fall through to text scan below.
    }

    // Plain text scan
    let raw: Uint8Array
    try {
      raw = await readBytesFn(entry)
    } catch (err) {
      if (warnings !== null) warnings.push(`rg: ${entry}: ${String(err)}`)
      continue
    }
    const textLines = DEC.decode(raw).split('\n')
    if (textLines.length > 0 && textLines[textLines.length - 1] === '') textLines.pop()
    const hits = grepLines(entry, textLines, pat, {
      invert: opts.invert,
      lineNumbers: opts.lineNumbers,
      countOnly: opts.countOnly,
      filesOnly: opts.filesOnly,
      onlyMatching: opts.onlyMatching,
      maxCount: opts.maxCount,
    })
    if (opts.countOnly) {
      if (hits.length > 0) results.push(`${entry}:${hits[0] ?? ''}`)
    } else if (opts.filesOnly) {
      for (const h of hits) results.push(h)
    } else {
      for (const h of hits) results.push(`${entry}:${h}`)
    }
  }

  return results
}
