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

import type { GSheetsAccessor } from '../../../accessor/gsheets.ts'
import { resolveGlob } from '../../../core/gsheets/glob.ts'
import { read as gsheetsRead } from '../../../core/gsheets/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'
import { fileReadProvision } from './provision.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function countLines(text: string): number {
  let n = 0
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n += 1
  return n
}

function countWords(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\s+/).length
}

function maxLineLen(text: string): number {
  let max = 0
  for (const line of text.split('\n')) if (line.length > max) max = line.length
  return max
}

async function wcCommand(
  accessor: GSheetsAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  let data: Uint8Array | null = null
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    data = await gsheetsRead(accessor, first, opts.index ?? undefined)
  } else {
    data = await readStdinAsync(opts.stdin)
    if (data === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('wc: missing operand\n') })]
    }
  }
  const text = DEC.decode(data)
  const lineCount = countLines(text)
  const wordCount = countWords(text)
  const byteCount = data.byteLength
  if (opts.flags.L === true) {
    const out: ByteSource = ENC.encode(String(maxLineLen(text)))
    return [out, new IOResult()]
  }
  if (opts.flags.args_l === true) return [ENC.encode(String(lineCount)), new IOResult()]
  if (opts.flags.w === true) return [ENC.encode(String(wordCount)), new IOResult()]
  if (opts.flags.m === true) return [ENC.encode(String(text.length)), new IOResult()]
  if (opts.flags.c === true) return [ENC.encode(String(byteCount)), new IOResult()]
  const out: ByteSource = ENC.encode(
    `${String(lineCount)}\t${String(wordCount)}\t${String(byteCount)}`,
  )
  return [out, new IOResult()]
}

export const GSHEETS_WC = command({
  name: 'wc',
  resource: ResourceName.GSHEETS,
  spec: specOf('wc'),
  fn: wcCommand,
  provision: fileReadProvision,
})
