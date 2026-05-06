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
import { resolveGlob } from '../../../core/s3/glob.ts'
import { read as s3Read } from '../../../core/s3/read.ts'
import { IOResult, materialize, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { resolveSource } from '../utils/stream.ts'
import { fileReadProvision } from './provision.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

async function* wcLinesStream(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  let count = 0
  for await (const chunk of source) {
    for (let i = 0; i < chunk.byteLength; i++) if (chunk[i] === 0x0a) count += 1
  }
  yield ENC.encode(String(count))
}

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
  accessor: S3Accessor,
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
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    const data = await s3Read(accessor, first, opts.index ?? undefined)
    const text = DEC.decode(data)
    const lineCount = countChar(text, '\n')
    const wordCount = text.split(/\s+/).filter((s) => s !== '').length
    const byteCount = data.byteLength
    if (LFlag) return [ENC.encode(String(maxLineLength(text))), new IOResult()]
    if (lFlag) return [ENC.encode(String(lineCount)), new IOResult()]
    if (wFlag) return [ENC.encode(String(wordCount)), new IOResult()]
    if (mFlag) return [ENC.encode(String(text.length)), new IOResult()]
    if (cFlag) return [ENC.encode(String(byteCount)), new IOResult()]
    const out = `${String(lineCount)}\t${String(wordCount)}\t${String(byteCount)}`
    return [ENC.encode(out), new IOResult()]
  }
  let source: AsyncIterable<Uint8Array>
  try {
    source = resolveSource(opts.stdin, 'wc: missing operand')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
  }
  if (lFlag) {
    const out: ByteSource = wcLinesStream(source)
    return [out, new IOResult()]
  }
  const raw = await materialize(source)
  const text = DEC.decode(raw)
  const lc = countChar(text, '\n')
  const wcVal = text.split(/\s+/).filter((s) => s !== '').length
  const bc = raw.byteLength
  const cc = text.length
  if (LFlag) return [ENC.encode(String(maxLineLength(text))), new IOResult()]
  if (wFlag) return [ENC.encode(String(wcVal)), new IOResult()]
  if (mFlag) return [ENC.encode(String(cc)), new IOResult()]
  if (cFlag) return [ENC.encode(String(bc)), new IOResult()]
  return [ENC.encode(`${String(lc)}\t${String(wcVal)}\t${String(bc)}`), new IOResult()]
}

export const S3_WC = command({
  name: 'wc',
  resource: ResourceName.S3,
  spec: specOf('wc'),
  fn: wcCommand,
  provision: fileReadProvision,
})
