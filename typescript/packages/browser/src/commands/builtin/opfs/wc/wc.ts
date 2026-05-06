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
  IOResult,
  ResourceName,
  command,
  materialize,
  resolveSource,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
  wcAggregate,
} from '@struktoai/mirage-core'
import { stream as opfsStream } from '../../../../core/opfs/stream.ts'
import type { OPFSAccessor } from '../../../../accessor/opfs.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

async function* wcLinesStream(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  let count = 0
  for await (const chunk of source) {
    for (let i = 0; i < chunk.byteLength; i++) if (chunk[i] === 0x0a) count += 1
  }
  yield ENC.encode(String(count))
}

async function readStream(accessor: OPFSAccessor, p: PathSpec): Promise<Uint8Array> {
  return materialize(opfsStream(accessor.rootHandle, p))
}

async function wcCommand(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const f = opts.flags
  const lFlag = f.args_l === true
  const wFlag = f.w === true
  const cFlag = f.c === true
  const mFlag = f.m === true
  const LFlag = f.L === true
  if (paths.length > 0) {
    const outputs: string[] = []
    let totalLines = 0
    let totalWords = 0
    let totalBytes = 0
    for (const p of paths) {
      const data = await readStream(accessor, p)
      const text = DEC.decode(data)
      const lineCount = countChar(text, '\n')
      const wordCount = text.split(/\s+/).filter((s) => s !== '').length
      const byteCount = data.byteLength
      if (LFlag) {
        const maxLen = text.split(/\r?\n/).reduce((m, l) => Math.max(m, l.length), 0)
        outputs.push(`${String(maxLen)}\t${p.original}`)
      } else if (lFlag) {
        outputs.push(`${String(lineCount)}\t${p.original}`)
        totalLines += lineCount
      } else if (wFlag) {
        outputs.push(`${String(wordCount)}\t${p.original}`)
        totalWords += wordCount
      } else if (cFlag) {
        outputs.push(`${String(byteCount)}\t${p.original}`)
        totalBytes += byteCount
      } else if (mFlag) {
        const charCount = text.length
        outputs.push(`${String(charCount)}\t${p.original}`)
        totalBytes += charCount
      } else {
        outputs.push(
          `${String(lineCount)}\t${String(wordCount)}\t${String(byteCount)}\t${p.original}`,
        )
        totalLines += lineCount
        totalWords += wordCount
        totalBytes += byteCount
      }
    }
    if (paths.length > 1) {
      if (lFlag) outputs.push(`${String(totalLines)}\ttotal`)
      else if (wFlag) outputs.push(`${String(totalWords)}\ttotal`)
      else if (cFlag) outputs.push(`${String(totalBytes)}\ttotal`)
      else if (mFlag) outputs.push(`${String(totalBytes)}\ttotal`)
      else
        outputs.push(`${String(totalLines)}\t${String(totalWords)}\t${String(totalBytes)}\ttotal`)
    }
    const out: ByteSource = ENC.encode(outputs.join('\n'))
    return [out, new IOResult()]
  }
  let source: AsyncIterable<Uint8Array>
  try {
    source = resolveSource(opts.stdin, 'wc: missing operand')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
  }
  if (lFlag) return [wcLinesStream(source), new IOResult()]
  const raw = await materialize(source)
  const text = DEC.decode(raw)
  const lc = countChar(text, '\n')
  const wcVal = text.split(/\s+/).filter((s) => s !== '').length
  const bc = raw.byteLength
  const cc = text.length
  if (LFlag) {
    const maxLen = text.split(/\r?\n/).reduce((m, l) => Math.max(m, l.length), 0)
    return [ENC.encode(String(maxLen)), new IOResult()]
  }
  if (wFlag) return [ENC.encode(String(wcVal)), new IOResult()]
  if (mFlag) return [ENC.encode(String(cc)), new IOResult()]
  if (cFlag) return [ENC.encode(String(bc)), new IOResult()]
  return [ENC.encode(`${String(lc)}\t${String(wcVal)}\t${String(bc)}`), new IOResult()]
}

function countChar(text: string, ch: string): number {
  let n = 0
  for (const c of text) if (c === ch) n += 1
  return n
}

export const OPFS_WC = command({
  name: 'wc',
  resource: ResourceName.OPFS,
  spec: specOf('wc'),
  fn: wcCommand,
  aggregate: wcAggregate,
})
