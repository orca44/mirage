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

import {
  FileType,
  IOResult,
  PathSpec,
  ResourceName,
  command,
  compilePattern,
  exitOnEmpty,
  grepLines,
  grepStream,
  materialize,
  prefixAggregate,
  quietMatch,
  resolveSource,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
} from '@struktoai/mirage-core'
import { stream as sshStream } from '../../../../core/ssh/stream.ts'
import { stat as sshStat } from '../../../../core/ssh/stat.ts'
import { find as sshFind } from '../../../../core/ssh/find.ts'
import type { SSHAccessor } from '../../../../accessor/ssh.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function getPattern(texts: readonly string[], flags: Record<string, string | boolean>): string {
  if (typeof flags.e === 'string') return flags.e
  if (texts.length > 0 && texts[0] !== undefined) return texts[0]
  throw new Error('grep: usage: grep [flags] pattern [path]')
}

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

async function readFile(accessor: SSHAccessor, p: PathSpec): Promise<Uint8Array> {
  return materialize(sshStream(accessor, p))
}

function splitLinesNoTrailing(text: string): string[] {
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text
  return stripped === '' ? [] : stripped.split('\n')
}

async function expandRecursive(accessor: SSHAccessor, paths: PathSpec[]): Promise<PathSpec[]> {
  const expanded: PathSpec[] = []
  for (const p of paths) {
    try {
      const st = await sshStat(accessor, p)
      if (st.type === FileType.DIRECTORY) {
        const entries = await sshFind(accessor, p, { type: 'f' })
        for (const entry of entries) {
          expanded.push(
            new PathSpec({
              original: entry,
              directory: entry,
              resolved: false,
              prefix: p.prefix,
            }),
          )
        }
      } else {
        expanded.push(p)
      }
    } catch {
      expanded.push(p)
    }
  }
  return expanded
}

async function grepImpl(
  name: string,
  accessor: SSHAccessor,
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
  const recursive = opts.flags.r === true || opts.flags.R === true

  if (recursive && paths.length > 0) {
    const pat = compilePattern(pattern, f.ignoreCase, f.fixedString, f.wholeWord)
    const expanded = await expandRecursive(accessor, paths)
    const allResults: string[] = []
    for (const p of expanded) {
      const data = splitLinesNoTrailing(DEC.decode(await readFile(accessor, p)))
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

  if (paths.length > 0) {
    const pat = compilePattern(pattern, f.ignoreCase, f.fixedString, f.wholeWord)

    if (paths.length > 1) {
      const allResults: string[] = []
      for (const p of paths) {
        const data = splitLinesNoTrailing(DEC.decode(await readFile(accessor, p)))
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

    const first = paths[0]
    if (first === undefined) return [null, new IOResult()]
    await sshStat(accessor, first)
    if (f.filesOnly) {
      const data = splitLinesNoTrailing(DEC.decode(await readFile(accessor, first)))
      const hits = grepLines(first.original, data, pat, f)
      if (hits.length === 0) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
      return [ENC.encode(hits.join('\n')), new IOResult()]
    }
    const source = sshStream(accessor, first)
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
    source = resolveSource(opts.stdin, `${name}: usage: ${name} [flags] pattern [path]`)
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

const grepFn = (
  accessor: SSHAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> => {
  return grepImpl('grep', accessor, paths, texts, opts)
}

export const SSH_GREP = command({
  name: 'grep',
  resource: ResourceName.SSH,
  spec: specOf('grep'),
  fn: grepFn,
  aggregate: prefixAggregate,
})

export { grepImpl }
