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
import { AsyncLineIterator } from '../../../io/async_line_iterator.ts'
import { IOResult } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { resolveSource } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitFields(line: string, fs: string): string[] {
  if (fs === '') return line.split(/\s+/).filter((s) => s !== '')
  const re = fs.length === 1 ? new RegExp(escapeRegex(fs)) : new RegExp(fs)
  return line.split(re)
}

function parseProgram(program: string): [string, string] {
  const trimmed = program.trim()
  if (trimmed.startsWith('{')) return ['', trimmed.slice(1).replace(/\}$/, '')]
  if (trimmed.includes('{')) {
    const idx = trimmed.indexOf('{')
    const condition = trimmed.slice(0, idx).trim()
    const action = trimmed
      .slice(idx + 1)
      .replace(/\}$/, '')
      .trim()
    return [condition, action]
  }
  return ['', trimmed]
}

function evalCondition(condition: string, fieldMap: Record<string, string>): boolean {
  const cond = condition.trim()
  if (cond === 'BEGIN' || cond === 'END') return false
  const patterns = [
    /(\$\d+|NR|NF)\s*==\s*(.+)/,
    /(\$\d+|NR|NF)\s*!=\s*(.+)/,
    /(\$\d+|NR|NF)\s*>\s*(.+)/,
    /(\$\d+|NR|NF)\s*<\s*(.+)/,
    /(\$\d+|NR|NF)\s*>=\s*(.+)/,
    /(\$\d+|NR|NF)\s*<=\s*(.+)/,
  ]
  for (const pat of patterns) {
    const m = pat.exec(cond)
    if (m !== null) {
      const lhsKey = m[1] ?? ''
      const rhsRaw = (m[2] ?? '').trim().replace(/^"|"$/g, '')
      const lhs = fieldMap[lhsKey] ?? ''
      const opMatch = /(==|!=|>=|<=|>|<)/.exec(cond)
      const op = opMatch !== null ? opMatch[1] : ''
      const lhsNum = Number.parseFloat(lhs)
      const rhsNum = Number.parseFloat(rhsRaw)
      if (!Number.isNaN(lhsNum) && !Number.isNaN(rhsNum)) {
        if (op === '==') return lhsNum === rhsNum
        if (op === '!=') return lhsNum !== rhsNum
        if (op === '>') return lhsNum > rhsNum
        if (op === '<') return lhsNum < rhsNum
        if (op === '>=') return lhsNum >= rhsNum
        if (op === '<=') return lhsNum <= rhsNum
      }
      if (op === '==') return lhs === rhsRaw
      if (op === '!=') return lhs !== rhsRaw
      return false
    }
  }
  if (cond.startsWith('/') && cond.endsWith('/')) {
    return new RegExp(cond.slice(1, -1)).test(fieldMap.$0 ?? '')
  }
  return true
}

function evalAction(action: string, fieldMap: Record<string, string>, fs: string): string {
  const parts: string[] = []
  for (const rawStmt of action.split(';')) {
    const stmt = rawStmt.trim()
    if (stmt === '') continue
    if (stmt.startsWith('print')) {
      const args = stmt.slice(5).trim()
      if (args === '') {
        parts.push(fieldMap.$0 ?? '')
      } else {
        const tokens = args.split(/,\s*/)
        const vals: string[] = []
        for (const raw of tokens) {
          const tok = raw.trim().replace(/^"|"$/g, '')
          vals.push(fieldMap[tok] ?? tok)
        }
        parts.push(vals.join(' '))
      }
    }
  }
  void fs
  return parts.join('\n')
}

function awkEvalLine(
  line: string,
  program: string,
  fs: string,
  variables: Record<string, string>,
  nr: number,
): string | null {
  const fields = splitFields(line, fs)
  const fieldMap: Record<string, string> = {
    $0: line,
    NR: String(nr),
    NF: String(fields.length),
  }
  for (let i = 0; i < fields.length; i++) fieldMap[`$${String(i + 1)}`] = fields[i] ?? ''
  for (const [k, v] of Object.entries(variables)) fieldMap[k] = v
  const [condition, action] = parseProgram(program)
  if (condition !== '' && !evalCondition(condition, fieldMap)) return null
  if (action === '') return line
  return evalAction(action, fieldMap, fs)
}

async function* awkStream(
  source: AsyncIterable<Uint8Array>,
  program: string,
  fs: string,
  variables: Record<string, string>,
): AsyncIterable<Uint8Array> {
  let nr = 0
  const iter = new AsyncLineIterator(source)
  for await (const lineBytes of iter) {
    nr += 1
    const line = DEC.decode(lineBytes)
    const result = awkEvalLine(line, program, fs, variables, nr)
    if (result !== null) yield ENC.encode(result + '\n')
  }
}

function stripMount(virtualPath: string, prefix: string): string {
  if (prefix !== '' && virtualPath.startsWith(prefix + '/')) {
    return '/' + virtualPath.slice(prefix.length).replace(/^\/+/, '')
  }
  return virtualPath
}

async function awkCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const resolved =
    paths.length > 0 ? await resolveGlob(accessor, paths, opts.index ?? undefined) : paths
  const mountPrefix = resolved[0]?.prefix ?? ''
  const fFlag = typeof opts.flags.f === 'string' ? opts.flags.f : null
  let program: string
  let dataPaths: string[]
  if (fFlag !== null) {
    const programSpec = new PathSpec({
      original: fFlag,
      directory: fFlag,
      resolved: false,
      prefix: mountPrefix,
    })
    try {
      const bytes = await s3Read(accessor, programSpec)
      program = DEC.decode(bytes).trim()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
    }
    dataPaths = [
      ...texts.map((t) => stripMount(t, mountPrefix)),
      ...resolved.map((p) => p.stripPrefix),
    ]
  } else if (texts.length > 0 && texts[0] !== undefined) {
    program = texts[0]
    dataPaths = resolved.map((p) => p.stripPrefix)
  } else {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode(`awk: usage: awk [-F fs] [-v var=val] 'program' [file ...]\n`),
      }),
    ]
  }
  const fs = typeof opts.flags.F === 'string' ? opts.flags.F : ' '
  const variables: Record<string, string> = {}
  if (typeof opts.flags.v === 'string' && opts.flags.v.includes('=')) {
    const [key, val] = opts.flags.v.split('=', 2)
    if (key !== undefined && val !== undefined) variables[key] = val
  }
  const cache: string[] = []
  let source: AsyncIterable<Uint8Array>
  if (dataPaths.length > 0) {
    const firstPath = dataPaths[0]
    if (firstPath === undefined) return [null, new IOResult()]
    const spec = new PathSpec({
      original: firstPath,
      directory: firstPath,
      resolved: false,
      prefix: mountPrefix,
    })
    source = s3Stream(accessor, spec)
    cache.push(firstPath)
  } else {
    try {
      source = resolveSource(opts.stdin, 'awk: missing input')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
    }
  }
  return [awkStream(source, program, fs, variables), new IOResult({ cache })]
}

export const S3_AWK = command({
  name: 'awk',
  resource: ResourceName.S3,
  spec: specOf('awk'),
  fn: awkCommand,
})
