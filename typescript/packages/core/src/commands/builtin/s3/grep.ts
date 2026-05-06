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

import type { S3Accessor } from '../../../accessor/s3.ts'
import { read as s3Read } from '../../../core/s3/read.ts'
import { resolveGlob } from '../../../core/s3/glob.ts'
import { stream as s3Stream } from '../../../core/s3/stream.ts'
import { exitOnEmpty, quietMatch } from '../../../io/stream.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { prefixAggregate } from '../aggregators.ts'
import { compilePattern, grepLines, grepStream } from '../grep_helper.ts'
import { resolveSource } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

interface FlagSet {
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

function parseFlags(flags: Record<string, string | boolean>): FlagSet {
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

function splitLinesNoTrailing(text: string): string[] {
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text
  return stripped === '' ? [] : stripped.split('\n')
}

async function grepCommand(
  accessor: S3Accessor,
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

  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const pat = compilePattern(pattern, f.ignoreCase, f.fixedString, f.wholeWord)

    if (resolved.length > 1) {
      const allResults: string[] = []
      for (const p of resolved) {
        const data = splitLinesNoTrailing(DEC.decode(await s3Read(accessor, p)))
        const hits = grepLines(p.original, data, pat, f)
        if (f.countOnly) {
          if (hits.length > 0) allResults.push(`${p.original}:${hits[0] ?? ''}`)
        } else if (f.filesOnly) {
          for (const h of hits) allResults.push(h)
        } else {
          for (const h of hits) allResults.push(`${p.original}:${h}`)
        }
      }
      if (allResults.length === 0) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
      const out: ByteSource = ENC.encode(allResults.join('\n'))
      return [out, new IOResult()]
    }

    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    if (f.filesOnly) {
      const data = splitLinesNoTrailing(DEC.decode(await s3Read(accessor, first)))
      const hits = grepLines(first.original, data, pat, f)
      if (hits.length === 0) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
      return [ENC.encode(hits.join('\n')), new IOResult()]
    }
    const source = s3Stream(accessor, first)
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

export const S3_GREP = command({
  name: 'grep',
  resource: ResourceName.S3,
  spec: specOf('grep'),
  fn: grepCommand,
  aggregate: prefixAggregate,
})
