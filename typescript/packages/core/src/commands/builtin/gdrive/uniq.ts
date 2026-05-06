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

import type { GDriveAccessor } from '../../../accessor/gdrive.ts'
import { resolveGlob } from '../../../core/gdrive/glob.ts'
import { read as gdriveRead } from '../../../core/gdrive/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

interface UniqOpts {
  count: boolean
  duplicatesOnly: boolean
  uniqueOnly: boolean
  skipFields: number
  skipChars: number
  checkChars: number
  ignoreCase: boolean
}

function comparisonKey(line: string, opts: UniqOpts): string {
  let text = line
  if (opts.skipFields > 0) {
    const parts = text.split(/\s+/).filter((s) => s !== '')
    const remaining = opts.skipFields < parts.length ? parts.slice(opts.skipFields) : []
    text = remaining.join(' ')
  }
  if (opts.skipChars > 0) text = text.slice(opts.skipChars)
  if (opts.checkChars > 0) text = text.slice(0, opts.checkChars)
  if (opts.ignoreCase) text = text.toLowerCase()
  return text
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value
}

function emitLine(line: string, count: number, opts: UniqOpts): string | null {
  if (opts.duplicatesOnly && count === 1) return null
  if (opts.uniqueOnly && count > 1) return null
  if (opts.count) return `${padLeft(String(count), 7)} ${line}`
  return line
}

function parseOpts(flags: Record<string, string | boolean>): UniqOpts {
  const intFlag = (key: 'f' | 's' | 'w'): number => {
    const v = flags[key]
    return typeof v === 'string' ? Number.parseInt(v, 10) : 0
  }
  return {
    count: flags.c === true,
    duplicatesOnly: flags.d === true,
    uniqueOnly: flags.u === true,
    skipFields: intFlag('f'),
    skipChars: intFlag('s'),
    checkChars: intFlag('w'),
    ignoreCase: flags.i === true,
  }
}

async function uniqCommand(
  accessor: GDriveAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  let text: string
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    text = DEC.decode(await gdriveRead(accessor, first, opts.index ?? undefined))
  } else {
    const raw = await readStdinAsync(opts.stdin)
    if (raw === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('uniq: missing operand\n') })]
    }
    text = DEC.decode(raw)
  }
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const uniqOpts = parseOpts(opts.flags)
  const out: string[] = []
  let prevLine: string | null = null
  let prevKey: string | null = null
  let prevCount = 0
  for (const line of lines) {
    const key = comparisonKey(line, uniqOpts)
    if (key === prevKey) {
      prevCount += 1
    } else {
      if (prevLine !== null) {
        const emitted = emitLine(prevLine, prevCount, uniqOpts)
        if (emitted !== null) out.push(emitted)
      }
      prevLine = line
      prevKey = key
      prevCount = 1
    }
  }
  if (prevLine !== null) {
    const emitted = emitLine(prevLine, prevCount, uniqOpts)
    if (emitted !== null) out.push(emitted)
  }
  const output = out.length > 0 ? out.join('\n') + '\n' : ''
  const result: ByteSource = ENC.encode(output)
  return [result, new IOResult()]
}

export const GDRIVE_UNIQ = command({
  name: 'uniq',
  resource: ResourceName.GDRIVE,
  spec: specOf('uniq'),
  fn: uniqCommand,
})
