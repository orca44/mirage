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

import { AsyncLineIterator } from '../../io/async_line_iterator.ts'
import { type FileStat, FileType } from '../../types.ts'
import { grepContextLines } from './grep_context.ts'

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function compilePattern(
  pattern: string,
  ignoreCase = false,
  fixedString = false,
  wholeWord = false,
): RegExp {
  let patStr = fixedString ? escapeRegex(pattern) : pattern
  if (wholeWord) patStr = `\\b${patStr}\\b`
  return new RegExp(patStr, ignoreCase ? 'i' : '')
}

export interface GrepLinesOptions {
  invert: boolean
  lineNumbers: boolean
  countOnly: boolean
  filesOnly: boolean
  onlyMatching: boolean
  maxCount: number | null
}

export function grepLines(
  path: string,
  data: readonly string[],
  compiled: RegExp,
  opts: GrepLinesOptions,
): string[] {
  const results: string[] = []
  let count = 0
  const reGlobal = opts.onlyMatching
    ? new RegExp(
        compiled.source,
        compiled.flags.includes('g') ? compiled.flags : compiled.flags + 'g',
      )
    : null
  for (let i = 0; i < data.length; i++) {
    const line = data[i] ?? ''
    const found = compiled.test(line)
    const matched = opts.invert ? !found : found
    if (!matched) continue
    count += 1
    if (!opts.countOnly && !opts.filesOnly) {
      let text: string
      if (opts.onlyMatching && !opts.invert && reGlobal !== null) {
        reGlobal.lastIndex = 0
        const m = reGlobal.exec(line)
        text = m !== null ? m[0] : line
      } else {
        text = line
      }
      const prefix = opts.lineNumbers ? `${String(i + 1)}:${text}` : text
      results.push(prefix)
    }
    if (opts.maxCount !== null && count >= opts.maxCount) break
  }
  if (opts.countOnly) return [String(count)]
  if (opts.filesOnly) return count > 0 ? [path] : []
  return results
}

export interface GrepStreamOptions {
  invert: boolean
  lineNumbers: boolean
  onlyMatching: boolean
  maxCount: number | null
  countOnly: boolean
  afterContext: number
  beforeContext: number
}

export async function* grepStream(
  source: AsyncIterable<Uint8Array>,
  pat: RegExp,
  opts: GrepStreamOptions,
): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder()
  const dec = new TextDecoder('utf-8', { fatal: false })
  const hasContext = opts.afterContext > 0 || opts.beforeContext > 0
  if (hasContext && !opts.countOnly && !opts.onlyMatching) {
    const allLines: string[] = []
    const iter = new AsyncLineIterator(source)
    for await (const raw of iter) allLines.push(dec.decode(raw))
    for (const chunk of grepContextLines(
      allLines,
      pat,
      opts.invert,
      opts.lineNumbers,
      opts.maxCount,
      opts.afterContext,
      opts.beforeContext,
    )) {
      yield chunk
    }
    return
  }
  let matchCount = 0
  let lineNum = 0
  const reGlobal = opts.onlyMatching
    ? new RegExp(pat.source, pat.flags.includes('g') ? pat.flags : pat.flags + 'g')
    : null
  const iter = new AsyncLineIterator(source)
  for await (const rawLine of iter) {
    lineNum += 1
    const line = dec.decode(rawLine)
    const found = pat.test(line)
    const hit = opts.invert ? !found : found
    if (!hit) continue
    if (opts.onlyMatching && !opts.invert && reGlobal !== null) {
      reGlobal.lastIndex = 0
      for (;;) {
        const m = reGlobal.exec(line)
        if (m === null) break
        matchCount += 1
        if (!opts.countOnly) yield enc.encode(m[0] + '\n')
        if (opts.maxCount !== null && matchCount >= opts.maxCount) {
          if (opts.countOnly) yield enc.encode(String(matchCount) + '\n')
          return
        }
      }
    } else {
      matchCount += 1
      if (!opts.countOnly) {
        if (opts.lineNumbers) yield enc.encode(`${String(lineNum)}:${line}\n`)
        else {
          const out = new Uint8Array(rawLine.byteLength + 1)
          out.set(rawLine, 0)
          out[rawLine.byteLength] = 0x0a
          yield out
        }
      }
      if (opts.maxCount !== null && matchCount >= opts.maxCount) {
        if (opts.countOnly) yield enc.encode(String(matchCount) + '\n')
        return
      }
    }
  }
  if (opts.countOnly) yield enc.encode(String(matchCount) + '\n')
}

export type AsyncReaddir = (path: string) => Promise<string[]>
export type AsyncStat = (path: string) => Promise<FileStat>
export type AsyncReadBytes = (path: string) => Promise<Uint8Array>

export interface GrepFilesOnlyOptions {
  recursive: boolean
  ignoreCase: boolean
  invert: boolean
  lineNumbers: boolean
  countOnly: boolean
  fixedString: boolean
  onlyMatching: boolean
  maxCount: number | null
  wholeWord: boolean
}

export async function grepRecursive(
  readdirFn: AsyncReaddir,
  statFn: AsyncStat,
  readBytesFn: AsyncReadBytes,
  path: string,
  compiled: RegExp,
  opts: GrepFilesOnlyOptions,
  warnings: string[] | null,
): Promise<string[]> {
  const filesOnlyOpts: GrepLinesOptions = {
    invert: opts.invert,
    lineNumbers: opts.lineNumbers,
    countOnly: opts.countOnly,
    filesOnly: true,
    onlyMatching: opts.onlyMatching,
    maxCount: opts.maxCount,
  }
  const results: string[] = []
  let entries: string[]
  try {
    entries = await readdirFn(path)
  } catch (err) {
    if (warnings !== null)
      warnings.push(`grep: ${path}: ${err instanceof Error ? err.message : String(err)}`)
    return results
  }
  for (const entry of entries) {
    let s: FileStat
    try {
      s = await statFn(entry)
    } catch (err) {
      if (warnings !== null)
        warnings.push(`grep: ${entry}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }
    if (s.type === FileType.DIRECTORY) {
      const sub = await grepRecursive(
        readdirFn,
        statFn,
        readBytesFn,
        entry,
        compiled,
        opts,
        warnings,
      )
      for (const r of sub) results.push(r)
    } else {
      try {
        const lines = new TextDecoder('utf-8', { fatal: false })
          .decode(await readBytesFn(entry))
          .split('\n')
        if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
        const fileResults = grepLines(entry, lines, compiled, filesOnlyOpts)
        if (opts.countOnly) {
          if (fileResults.length > 0) results.push(`${entry}:${fileResults[0] ?? ''}`)
        } else {
          for (const r of fileResults) results.push(r)
        }
      } catch (err) {
        if (warnings !== null)
          warnings.push(`grep: ${entry}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }
  return results
}

export async function grepFilesOnly(
  readdirFn: AsyncReaddir,
  statFn: AsyncStat,
  readBytesFn: AsyncReadBytes,
  path: string,
  pattern: string,
  opts: GrepFilesOnlyOptions,
  warnings: string[] | null = null,
): Promise<string[]> {
  const compiled = compilePattern(pattern, opts.ignoreCase, opts.fixedString, opts.wholeWord)
  if (opts.recursive) {
    return grepRecursive(readdirFn, statFn, readBytesFn, path, compiled, opts, warnings)
  }
  try {
    const data = await readBytesFn(path)
    const text = new TextDecoder('utf-8', { fatal: false }).decode(data)
    const lines = text.split('\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    let count = 0
    for (const line of lines) {
      const found = compiled.test(line)
      const matched = opts.invert ? !found : found
      if (matched) {
        count += 1
        if (opts.maxCount !== null && count >= opts.maxCount) break
      }
    }
    if (opts.countOnly) return [String(count)]
    return count > 0 ? [path] : []
  } catch (err) {
    if (warnings !== null)
      warnings.push(`grep: ${path}: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    const s = await statFn(path)
    if (s.type === FileType.DIRECTORY) {
      return await grepRecursive(readdirFn, statFn, readBytesFn, path, compiled, opts, warnings)
    }
  } catch (err) {
    if (warnings !== null)
      warnings.push(`grep: ${path}: ${err instanceof Error ? err.message : String(err)}`)
    try {
      await readdirFn(path)
      return await grepRecursive(readdirFn, statFn, readBytesFn, path, compiled, opts, warnings)
    } catch (err2) {
      if (warnings !== null)
        warnings.push(`grep: ${path}: ${err2 instanceof Error ? err2.message : String(err2)}`)
    }
  }
  return []
}
