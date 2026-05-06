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

import type { PostHogAccessor } from '../../../accessor/posthog.ts'
import { resolveGlob } from '../../../core/posthog/glob.ts'
import { read as posthogRead } from '../../../core/posthog/read.ts'
import { readdir as posthogReaddir } from '../../../core/posthog/readdir.ts'
import { stat as posthogStat } from '../../../core/posthog/stat.ts'
import { IOResult } from '../../../io/types.ts'
import { type FileStat, FileType, PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { compilePattern, grepLines, grepRecursive } from '../grep_helper.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

interface RgFlags {
  ignoreCase: boolean
  invert: boolean
  lineNumbers: boolean
  countOnly: boolean
  filesOnly: boolean
  wholeWord: boolean
  fixedString: boolean
  onlyMatching: boolean
  maxCount: number | null
  hidden: boolean
}

function parseRgFlags(flags: Record<string, string | boolean>): RgFlags {
  const toInt = (v: string | boolean | undefined): number | null =>
    typeof v === 'string' ? Number.parseInt(v, 10) : null
  return {
    ignoreCase: flags.i === true,
    invert: flags.v === true,
    lineNumbers: flags.n === true,
    countOnly: flags.c === true,
    filesOnly: flags.args_l === true,
    wholeWord: flags.w === true,
    fixedString: flags.F === true,
    onlyMatching: flags.o === true,
    maxCount: toInt(flags.m),
    hidden: flags.hidden === true,
  }
}

function splitLinesNoTrailing(text: string): string[] {
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text
  return stripped === '' ? [] : stripped.split('\n')
}

async function rgCommand(
  accessor: PostHogAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const [exprText] = texts
  if (exprText === undefined) {
    return [
      null,
      new IOResult({ exitCode: 2, stderr: ENC.encode('rg: usage: rg [flags] pattern [path]\n') }),
    ]
  }
  const f = parseRgFlags(opts.flags)
  const pat = compilePattern(exprText, f.ignoreCase, f.fixedString, f.wholeWord)

  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const target = resolved[0]
    if (target === undefined) return [null, new IOResult()]
    const filePrefix = target.prefix
    const toScope = (p: string): PathSpec =>
      new PathSpec({ original: p, directory: p, prefix: filePrefix })
    const rd = (p: string): Promise<string[]> =>
      posthogReaddir(accessor, toScope(p), opts.index ?? undefined)
    const st = (p: string): Promise<FileStat> =>
      posthogStat(accessor, toScope(p), opts.index ?? undefined)
    const rb = (p: string): Promise<Uint8Array> =>
      posthogRead(accessor, toScope(p), opts.index ?? undefined)
    const warnings: string[] = []
    const allResults: string[] = []
    let anyMatch = false
    for (const p of resolved) {
      let s: FileStat
      try {
        s = await st(p.original)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnings.push(`rg: ${p.original}: ${msg}`)
        continue
      }
      if (s.type === FileType.DIRECTORY) {
        const res = await grepRecursive(
          rd,
          st,
          rb,
          p.original,
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
        if (res.length > 0) anyMatch = true
        allResults.push(...res)
        continue
      }
      let data: Uint8Array
      try {
        data = await rb(p.original)
      } catch {
        warnings.push(`rg: ${p.original}: No such file or directory`)
        continue
      }
      const lines = splitLinesNoTrailing(DEC.decode(data))
      const matched = grepLines(p.original, lines, pat, f)
      if (matched.length === 0) continue
      anyMatch = true
      if (f.filesOnly) {
        allResults.push(p.original)
      } else if (f.countOnly) {
        allResults.push(`${p.original}:${String(matched.length)}`)
      } else {
        for (const line of matched) allResults.push(`${p.original}:${line}`)
      }
    }
    const stderr = warnings.length > 0 ? ENC.encode(warnings.join('\n')) : null
    if (!anyMatch) return [new Uint8Array(0), new IOResult({ exitCode: 1, stderr })]
    return [ENC.encode(allResults.join('\n')), new IOResult({ stderr })]
  }

  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [
      null,
      new IOResult({ exitCode: 2, stderr: ENC.encode('rg: usage: rg [flags] pattern path\n') }),
    ]
  }
  const lines = splitLinesNoTrailing(DEC.decode(raw))
  const matched = grepLines('<stdin>', lines, pat, f)
  if (matched.length === 0) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
  if (f.countOnly) return [ENC.encode(String(matched.length)), new IOResult()]
  return [ENC.encode(matched.join('\n')), new IOResult()]
}

export const POSTHOG_RG = command({
  name: 'rg',
  resource: ResourceName.POSTHOG,
  spec: specOf('rg'),
  fn: rgCommand,
})
