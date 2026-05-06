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

import type { LangfuseAccessor } from '../../../accessor/langfuse.ts'
import {
  fetchDatasets,
  fetchPrompts,
  fetchSessions,
  fetchTraces,
} from '../../../core/langfuse/_client.ts'
import { resolveLangfuseGlob } from '../../../core/langfuse/glob.ts'
import { read as langfuseRead } from '../../../core/langfuse/read.ts'
import { readdir as langfuseReaddir } from '../../../core/langfuse/readdir.ts'
import { detectScope } from '../../../core/langfuse/scope.ts'
import { stat as langfuseStat } from '../../../core/langfuse/stat.ts'
import { exitOnEmpty, quietMatch, yieldBytes } from '../../../io/stream.ts'
import { IOResult } from '../../../io/types.ts'
import { type FileStat, FileType, PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { compilePattern, grepFilesOnly, grepRecursive, grepStream } from '../grep_helper.ts'
import { resolveSource } from '../utils/stream.ts'
import { fileReadProvision } from './_provision.ts'

const ENC = new TextEncoder()

interface GrepFlags {
  ignoreCase: boolean
  invert: boolean
  lineNumbers: boolean
  countOnly: boolean
  filesOnly: boolean
  wholeWord: boolean
  fixedString: boolean
  onlyMatching: boolean
  maxCount: number | null
  quiet: boolean
  afterContext: number
  beforeContext: number
}

function parseFlags(flags: Record<string, string | boolean>): GrepFlags {
  const toInt = (v: string | boolean | undefined): number | null =>
    typeof v === 'string' ? Number.parseInt(v, 10) : null
  const aCtx = toInt(flags.A)
  const bCtx = toInt(flags.B)
  const cCtx = toInt(flags.C)
  return {
    ignoreCase: flags.i === true,
    invert: flags.v === true,
    lineNumbers: flags.n === true,
    countOnly: flags.c === true,
    filesOnly: flags.args_l === true || flags.l === true,
    wholeWord: flags.w === true,
    fixedString: flags.F === true,
    onlyMatching: flags.o === true,
    maxCount: toInt(flags.m),
    quiet: flags.q === true,
    afterContext: aCtx ?? cCtx ?? 0,
    beforeContext: bCtx ?? cCtx ?? 0,
  }
}

function getPattern(texts: readonly string[], flags: Record<string, string | boolean>): string {
  if (typeof flags.e === 'string') return flags.e
  if (texts.length > 0 && texts[0] !== undefined) return texts[0]
  throw new Error('grep: usage: grep [flags] pattern [path]')
}

function pickString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function filterTraces(
  traces: readonly Record<string, unknown>[],
  pattern: RegExp,
): CommandFnResult {
  const lines: string[] = []
  for (const t of traces) {
    const traceId = pickString(t, 'id')
    const lineJson = JSON.stringify(t)
    if (!pattern.test(lineJson)) continue
    lines.push(`traces/${traceId}.json:${lineJson}`)
  }
  if (lines.length === 0) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
  return [ENC.encode(lines.join('\n')), new IOResult()]
}

function filterSessions(
  sessions: readonly Record<string, unknown>[],
  pattern: RegExp,
): CommandFnResult {
  const lines: string[] = []
  for (const s of sessions) {
    const sessionId = pickString(s, 'id')
    if (!pattern.test(sessionId)) continue
    const lineJson = JSON.stringify(s)
    lines.push(`sessions/${sessionId}:${lineJson}`)
  }
  if (lines.length === 0) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
  return [ENC.encode(lines.join('\n')), new IOResult()]
}

function filterPrompts(
  prompts: readonly Record<string, unknown>[],
  pattern: RegExp,
): CommandFnResult {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const p of prompts) {
    const promptName = pickString(p, 'name')
    if (seen.has(promptName)) continue
    if (!pattern.test(promptName)) continue
    seen.add(promptName)
    const lineJson = JSON.stringify(p)
    lines.push(`prompts/${promptName}:${lineJson}`)
  }
  if (lines.length === 0) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
  return [ENC.encode(lines.join('\n')), new IOResult()]
}

function filterDatasets(
  datasets: readonly Record<string, unknown>[],
  pattern: RegExp,
): CommandFnResult {
  const lines: string[] = []
  for (const d of datasets) {
    const datasetName = pickString(d, 'name')
    if (!pattern.test(datasetName)) continue
    const lineJson = JSON.stringify(d)
    lines.push(`datasets/${datasetName}:${lineJson}`)
  }
  if (lines.length === 0) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
  return [ENC.encode(lines.join('\n')), new IOResult()]
}

async function grepCommand(
  accessor: LangfuseAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  let pattern: string
  try {
    pattern = getPattern(texts, opts.flags)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode(`${msg}\n`) })]
  }
  const f = parseFlags(opts.flags)
  const limit = accessor.config.defaultSearchLimit ?? 50

  if (paths.length > 0) {
    const first = paths[0]
    if (first !== undefined) {
      const scope = detectScope(first)
      const pat = compilePattern(pattern, f.ignoreCase, f.fixedString, f.wholeWord)
      if (scope.level === 'traces' || scope.level === 'root') {
        const traces = await fetchTraces(accessor.transport, { limit })
        return filterTraces(traces, pat)
      }
      if (scope.level === 'sessions') {
        const sessions = await fetchSessions(accessor.transport, { limit })
        return filterSessions(sessions, pat)
      }
      if (scope.level === 'prompts') {
        const prompts = await fetchPrompts(accessor.transport)
        return filterPrompts(prompts, pat)
      }
      if (scope.level === 'datasets') {
        const datasets = await fetchDatasets(accessor.transport)
        return filterDatasets(datasets, pat)
      }
    }

    const resolved = await resolveLangfuseGlob(accessor, paths, opts.index ?? undefined)
    const target = resolved[0]
    if (target === undefined) return [null, new IOResult()]
    const filePrefix = target.prefix
    const toScope = (p: string): PathSpec =>
      new PathSpec({ original: p, directory: p, prefix: filePrefix })
    const rd = (p: string): Promise<string[]> =>
      langfuseReaddir(accessor, toScope(p), opts.index ?? undefined)
    const st = (p: string): Promise<FileStat> =>
      langfuseStat(accessor, toScope(p), opts.index ?? undefined)
    const rb = (p: string): Promise<Uint8Array> =>
      langfuseRead(accessor, toScope(p), opts.index ?? undefined)
    const recursive = opts.flags.r === true || opts.flags.R === true
    const warnings: string[] = []

    if (f.filesOnly) {
      const results = await grepFilesOnly(
        rd,
        st,
        rb,
        target.original,
        pattern,
        {
          recursive,
          ignoreCase: f.ignoreCase,
          invert: f.invert,
          lineNumbers: f.lineNumbers,
          countOnly: f.countOnly,
          fixedString: f.fixedString,
          onlyMatching: f.onlyMatching,
          maxCount: f.maxCount,
          wholeWord: f.wholeWord,
        },
        warnings,
      )
      const stderr = warnings.length > 0 ? ENC.encode(warnings.join('\n')) : undefined
      if (results.length === 0) {
        return [
          new Uint8Array(0),
          new IOResult({ exitCode: 1, ...(stderr !== undefined ? { stderr } : {}) }),
        ]
      }
      return [
        ENC.encode(results.join('\n') + '\n'),
        new IOResult({ ...(stderr !== undefined ? { stderr } : {}) }),
      ]
    }

    const pat = compilePattern(pattern, f.ignoreCase, f.fixedString, f.wholeWord)
    let fileStat: FileStat
    try {
      fileStat = await st(target.original)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 2, stderr: ENC.encode(`grep: ${msg}\n`) })]
    }
    if (fileStat.type === FileType.DIRECTORY) {
      if (!recursive) {
        return [
          new Uint8Array(0),
          new IOResult({
            exitCode: 1,
            stderr: ENC.encode(`grep: ${target.original}: Is a directory`),
          }),
        ]
      }
      const results = await grepRecursive(
        rd,
        st,
        rb,
        target.original,
        pat,
        {
          recursive: true,
          ignoreCase: f.ignoreCase,
          invert: f.invert,
          lineNumbers: f.lineNumbers,
          countOnly: f.countOnly,
          fixedString: f.fixedString,
          onlyMatching: f.onlyMatching,
          maxCount: f.maxCount,
          wholeWord: f.wholeWord,
        },
        warnings,
      )
      const stderr = warnings.length > 0 ? ENC.encode(warnings.join('\n')) : null
      if (results.length === 0) {
        return [new Uint8Array(0), new IOResult({ exitCode: 1, stderr })]
      }
      return [ENC.encode(results.join('\n')), new IOResult({ stderr })]
    }

    const data = await langfuseRead(accessor, target, opts.index ?? undefined)
    const source = yieldBytes(data)
    const stream = grepStream(source, pat, f)
    if (f.quiet) {
      const io = new IOResult({ exitCode: 1 })
      return [quietMatch(stream, io), io]
    }
    const io = new IOResult()
    return [exitOnEmpty(stream, io), io]
  }

  let source: AsyncIterable<Uint8Array>
  try {
    source = resolveSource(opts.stdin, 'grep: usage: grep [flags] pattern [path]')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode(`${msg}\n`) })]
  }
  const pat = compilePattern(pattern, f.ignoreCase, f.fixedString, f.wholeWord)
  const stream = grepStream(source, pat, f)
  if (f.quiet) {
    const io = new IOResult({ exitCode: 1 })
    return [quietMatch(stream, io), io]
  }
  const io = new IOResult()
  return [exitOnEmpty(stream, io), io]
}

export const LANGFUSE_GREP = command({
  name: 'grep',
  resource: ResourceName.LANGFUSE,
  spec: specOf('grep'),
  fn: grepCommand,
  provision: fileReadProvision,
})
