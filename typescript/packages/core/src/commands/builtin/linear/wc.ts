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

import type { LinearAccessor } from '../../../accessor/linear.ts'
import { resolveLinearGlob } from '../../../core/linear/glob.ts'
import { read as linearRead } from '../../../core/linear/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'
import { fileReadProvision } from './_provision.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function countChar(text: string, ch: string): number {
  let n = 0
  for (const c of text) if (c === ch) n += 1
  return n
}

function maxLineLength(text: string): number {
  let max = 0
  let current = 0
  for (const c of text) {
    if (c === '\n') {
      if (current > max) max = current
      current = 0
    } else {
      current += 1
    }
  }
  if (current > max) max = current
  return max
}

async function wcCommand(
  accessor: LinearAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const f = opts.flags
  const lFlag = f.args_l === true
  const wFlag = f.w === true
  const cFlag = f.c === true
  const mFlag = f.m === true
  const LFlag = f.L === true
  let data: Uint8Array | null
  if (paths.length > 0) {
    const resolved = await resolveLinearGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    data = await linearRead(accessor, first, opts.index ?? undefined)
  } else {
    data = await readStdinAsync(opts.stdin)
    if (data === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('wc: missing operand\n') })]
    }
  }
  const text = DEC.decode(data)
  const lineCount = countChar(text, '\n')
  const wordCount = text.split(/\s+/).filter((s) => s !== '').length
  const byteCount = data.byteLength
  let payload: string
  if (LFlag) payload = String(maxLineLength(text))
  else if (lFlag) payload = String(lineCount)
  else if (wFlag) payload = String(wordCount)
  else if (mFlag) payload = String(text.length)
  else if (cFlag) payload = String(byteCount)
  else payload = `${String(lineCount)}\t${String(wordCount)}\t${String(byteCount)}`
  const out: ByteSource = ENC.encode(payload)
  return [out, new IOResult()]
}

export const LINEAR_WC = command({
  name: 'wc',
  resource: ResourceName.LINEAR,
  spec: specOf('wc'),
  fn: wcCommand,
  provision: fileReadProvision,
})
