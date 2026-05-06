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

import type { DropboxAccessor } from '../../../accessor/dropbox.ts'
import { read as dropboxRead } from '../../../core/dropbox/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitFields(line: string, fs: string): string[] {
  if (fs === '' || fs === ' ') return line.split(/\s+/).filter((s) => s !== '')
  const re = fs.length === 1 ? new RegExp(escapeRegex(fs)) : new RegExp(fs)
  return line.split(re)
}

function parseProgram(program: string): [string, string] {
  const trimmed = program.trim()
  if (trimmed.startsWith('{')) return ['', trimmed.slice(1).replace(/\}$/, '')]
  const idx = trimmed.indexOf('{')
  if (idx >= 0) {
    const condition = trimmed.slice(0, idx).trim()
    const action = trimmed
      .slice(idx + 1)
      .replace(/\}$/, '')
      .trim()
    return [condition, action]
  }
  return ['', trimmed]
}

function evalCondition(condition: string, fields: Map<string, string>): boolean {
  const trimmed = condition.trim()
  if (trimmed === 'BEGIN' || trimmed === 'END') return false
  const cmpRe = /^(\$\d+|NR|NF)\s*(==|!=|>=|<=|>|<)\s*(.+)$/
  const m = cmpRe.exec(trimmed)
  if (m !== null) {
    const lhsKey = m[1] ?? ''
    const op = m[2] ?? '=='
    const rhsRaw = (m[3] ?? '').trim().replace(/^"|"$/g, '')
    const lhs = fields.get(lhsKey) ?? ''
    const lhsNum = Number(lhs)
    const rhsNum = Number(rhsRaw)
    if (Number.isFinite(lhsNum) && Number.isFinite(rhsNum)) {
      switch (op) {
        case '==':
          return lhsNum === rhsNum
        case '!=':
          return lhsNum !== rhsNum
        case '>':
          return lhsNum > rhsNum
        case '<':
          return lhsNum < rhsNum
        case '>=':
          return lhsNum >= rhsNum
        case '<=':
          return lhsNum <= rhsNum
      }
    }
    if (op === '==') return lhs === rhsRaw
    if (op === '!=') return lhs !== rhsRaw
    return false
  }
  if (trimmed.startsWith('/') && trimmed.endsWith('/')) {
    const regex = trimmed.slice(1, -1)
    return new RegExp(regex).test(fields.get('$0') ?? '')
  }
  return true
}

function evalAction(action: string, fields: Map<string, string>): string {
  const parts: string[] = []
  for (const stmt of action.split(';')) {
    const t = stmt.trim()
    if (t === '') continue
    if (t.startsWith('print')) {
      const args = t.slice(5).trim()
      if (args === '') {
        parts.push(fields.get('$0') ?? '')
      } else {
        const tokens = args.split(/,\s*/)
        const vals: string[] = []
        for (const rawTok of tokens) {
          const tok = rawTok.trim().replace(/^"|"$/g, '')
          vals.push(fields.get(tok) ?? tok)
        }
        parts.push(vals.join(' '))
      }
    }
  }
  return parts.length > 0 ? parts.join('\n') : ''
}

function evalLine(
  line: string,
  program: string,
  fs: string,
  vars: Map<string, string>,
  nr: number,
): string | null {
  const fields = splitFields(line, fs)
  const map = new Map<string, string>()
  map.set('$0', line)
  map.set('NR', String(nr))
  map.set('NF', String(fields.length))
  for (let i = 0; i < fields.length; i++) {
    const fld = fields[i]
    if (fld !== undefined) map.set(`$${String(i + 1)}`, fld)
  }
  for (const [k, v] of vars) map.set(k, v)
  const [condition, action] = parseProgram(program)
  if (condition !== '' && !evalCondition(condition, map)) return null
  if (action === '') return line
  return evalAction(action, map)
}

async function awkCommand(
  accessor: DropboxAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  let program: string
  let dataPaths: PathSpec[]
  if (typeof opts.flags.f === 'string') {
    const progSpec = new PathSpec({
      original: opts.flags.f,
      directory: opts.flags.f,
      prefix: opts.mountPrefix ?? '',
    })
    program = DEC.decode(await dropboxRead(accessor, progSpec, opts.index ?? undefined)).trim()
    dataPaths = [
      ...texts.map(
        (t) => new PathSpec({ original: t, directory: t, prefix: opts.mountPrefix ?? '' }),
      ),
      ...paths,
    ]
  } else if (texts.length > 0 && texts[0] !== undefined) {
    program = texts[0]
    dataPaths = paths
  } else {
    return [
      null,
      new IOResult({
        exitCode: 2,
        stderr: ENC.encode("awk: usage: awk [-F fs] [-v var=val] 'program' [file ...]\n"),
      }),
    ]
  }
  const fs = typeof opts.flags.F === 'string' ? opts.flags.F : ' '
  const vars = new Map<string, string>()
  if (typeof opts.flags.v === 'string' && opts.flags.v.includes('=')) {
    const idx = opts.flags.v.indexOf('=')
    vars.set(opts.flags.v.slice(0, idx), opts.flags.v.slice(idx + 1))
  }

  let text: string
  if (dataPaths.length > 0) {
    const first = dataPaths[0]
    if (first === undefined) return [null, new IOResult()]
    text = DEC.decode(await dropboxRead(accessor, first, opts.index ?? undefined))
  } else {
    const raw = await readStdinAsync(opts.stdin)
    if (raw === null) {
      return [null, new IOResult({ exitCode: 2, stderr: ENC.encode('awk: missing input\n') })]
    }
    text = DEC.decode(raw)
  }

  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const result = evalLine(line, program, fs, vars, i + 1)
    if (result !== null) out.push(result)
  }
  const output = out.length > 0 ? out.join('\n') + '\n' : ''
  const result: ByteSource = ENC.encode(output)
  return [result, new IOResult()]
}

export const DROPBOX_AWK = command({
  name: 'awk',
  resource: ResourceName.DROPBOX,
  spec: specOf('awk'),
  fn: awkCommand,
})
