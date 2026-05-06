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
  AsyncLineIterator,
  IOResult,
  ResourceName,
  command,
  materialize,
  resolveSource,
  specOf,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as opfsStream } from '../../../core/opfs/stream.ts'
import type { OPFSAccessor } from '../../../accessor/opfs.ts'

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

function evalAction(action: string, fieldMap: Record<string, string>): string {
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
  return evalAction(action, fieldMap)
}

function parseBlocks(program: string): [string, string, string] {
  let begin = ''
  let end = ''
  let main = program
  const beginMatch = /^BEGIN\s*\{([^}]*)\}\s*([\s\S]*)/.exec(program)
  if (beginMatch !== null) {
    begin = (beginMatch[1] ?? '').trim()
    main = (beginMatch[2] ?? '').trim()
  }
  const endMatch = /END\s*\{([^}]*)\}\s*$/.exec(main)
  if (endMatch !== null) {
    end = (endMatch[1] ?? '').trim()
    main = main.slice(0, endMatch.index).trim()
  }
  return [begin, main, end]
}

function evalAccumulator(
  action: string,
  fieldMap: Record<string, string>,
  accum: Record<string, number>,
): void {
  for (const rawStmt of action.split(';')) {
    const stmt = rawStmt.trim()
    const m = /(\w+)\s*\+=\s*(.+)/.exec(stmt)
    if (m !== null) {
      const variable = m[1] ?? ''
      const expr = (m[2] ?? '').trim()
      const val = fieldMap[expr] ?? expr
      const n = Number.parseFloat(val)
      if (!Number.isNaN(n)) accum[variable] = (accum[variable] ?? 0) + n
    }
  }
}

function evalEndAction(action: string, accum: Record<string, number>): string {
  const parts: string[] = []
  for (const rawStmt of action.split(';')) {
    const stmt = rawStmt.trim()
    if (!stmt.startsWith('print')) continue
    const args = stmt.slice(5).trim()
    if (args === '') continue
    const tokens = args.split(/,\s*/)
    const vals: string[] = []
    for (const raw of tokens) {
      const tok = raw.trim().replace(/^"|"$/g, '')
      if (tok in accum) {
        const v = accum[tok] ?? 0
        vals.push(Number.isInteger(v) ? String(v) : String(v))
      } else {
        vals.push(tok)
      }
    }
    parts.push(vals.join(' '))
  }
  return parts.join('\n')
}

async function* awkStream(
  source: AsyncIterable<Uint8Array>,
  program: string,
  fs: string,
  variables: Record<string, string>,
): AsyncIterable<Uint8Array> {
  const [, main, end] = parseBlocks(program)
  const accum: Record<string, number> = {}
  let nr = 0
  const iter = new AsyncLineIterator(source)
  for await (const lineBytes of iter) {
    nr += 1
    const line = DEC.decode(lineBytes)
    if (main !== '') {
      const fields = splitFields(line, fs)
      const fieldMap: Record<string, string> = {
        $0: line,
        NR: String(nr),
        NF: String(fields.length),
      }
      for (let i = 0; i < fields.length; i++) fieldMap[`$${String(i + 1)}`] = fields[i] ?? ''
      const [condition, action] = parseProgram(main)
      if (condition !== '' && !evalCondition(condition, fieldMap)) continue
      evalAccumulator(action, fieldMap, accum)
      const result = awkEvalLine(line, main, fs, variables, nr)
      if (result !== null && result !== '') yield ENC.encode(result + '\n')
    }
  }
  if (end !== '') {
    const result = evalEndAction(end, accum)
    if (result !== '') yield ENC.encode(result + '\n')
  }
}

function stripMount(virtualPath: string, prefix: string): string {
  if (prefix !== '' && virtualPath.startsWith(prefix + '/')) {
    return '/' + virtualPath.slice(prefix.length).replace(/^\/+/, '')
  }
  return virtualPath
}

async function readFile(accessor: OPFSAccessor, p: PathSpec): Promise<Uint8Array> {
  return materialize(opfsStream(accessor.rootHandle, p))
}

async function awkCommand(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const fFlag = typeof opts.flags.f === 'string' ? opts.flags.f : null
  let program: string
  let dataPaths: string[]
  if (fFlag !== null) {
    const programPath = fFlag
    const programSpec: PathSpec = { original: programPath, stripPrefix: programPath } as PathSpec
    try {
      program = DEC.decode(await readFile(accessor, programSpec)).trim()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
    }
    const mountPrefix = paths[0]?.prefix ?? ''
    dataPaths = [
      ...texts.map((t) => stripMount(t, mountPrefix)),
      ...paths.map((p) => p.stripPrefix),
    ]
  } else if (texts.length > 0 && texts[0] !== undefined) {
    program = texts[0]
    dataPaths = paths.map((p) => p.stripPrefix)
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
    const spec: PathSpec = { original: firstPath, stripPrefix: firstPath } as PathSpec
    source = opfsStream(accessor.rootHandle, spec)
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

export const OPFS_AWK = command({
  name: 'awk',
  resource: ResourceName.OPFS,
  spec: specOf('awk'),
  fn: awkCommand,
})
