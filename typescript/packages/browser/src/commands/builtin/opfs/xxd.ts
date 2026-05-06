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

function padLeft(s: string, width: number, ch = ' '): string {
  return s.length >= width ? s : ch.repeat(width - s.length) + s
}

function padRight(s: string, width: number, ch = ' '): string {
  return s.length >= width ? s : s + ch.repeat(width - s.length)
}

function hexByte(b: number, uppercase: boolean): string {
  const h = b.toString(16).padStart(2, '0')
  return uppercase ? h.toUpperCase() : h
}

function hexOffset(offset: number, uppercase: boolean): string {
  const h = offset.toString(16).padStart(8, '0')
  return uppercase ? h.toUpperCase() : h
}

async function* xxdDumpStream(
  source: AsyncIterable<Uint8Array>,
  cols: number,
  group: number,
  uppercase: boolean,
): AsyncIterable<Uint8Array> {
  let offset = 0
  let leftover = new Uint8Array(0)
  const hexColumnWidth = cols * 2 + Math.floor(cols / group) - 1
  const emitRow = (row: Uint8Array): Uint8Array => {
    const hexParts: string[] = []
    for (let g = 0; g < row.byteLength; g += group) {
      let seg = ''
      const end = Math.min(g + group, row.byteLength)
      for (let k = g; k < end; k++) seg += hexByte(row[k] ?? 0, uppercase)
      hexParts.push(seg)
    }
    const hexPart = hexParts.join(' ')
    let asciiPart = ''
    for (const b of row) asciiPart += b >= 32 && b < 127 ? String.fromCharCode(b) : '.'
    const line = `${hexOffset(offset, uppercase)}: ${padRight(hexPart, hexColumnWidth)}  ${asciiPart}\n`
    return ENC.encode(line)
  }
  for await (const chunk of source) {
    const merged = new Uint8Array(leftover.byteLength + chunk.byteLength)
    merged.set(leftover, 0)
    merged.set(chunk, leftover.byteLength)
    let i = 0
    while (i + cols <= merged.byteLength) {
      yield emitRow(merged.subarray(i, i + cols))
      offset += cols
      i += cols
    }
    leftover = merged.subarray(i)
  }
  if (leftover.byteLength > 0) {
    yield emitRow(leftover)
  }
}

async function* xxdPlainStream(
  source: AsyncIterable<Uint8Array>,
  uppercase: boolean,
): AsyncIterable<Uint8Array> {
  for await (const chunk of source) {
    let hex = ''
    for (const b of chunk) hex += hexByte(b, uppercase)
    yield ENC.encode(hex)
  }
  yield ENC.encode('\n')
}

async function* xxdReverseStream(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const c of source) chunks.push(c)
  let total = 0
  for (const c of chunks) total += c.byteLength
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.byteLength
  }
  const text = DEC.decode(buf).replace(/[\n ]/g, '')
  const out = new Uint8Array(text.length / 2)
  for (let i = 0; i < out.byteLength; i++)
    out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16)
  yield out
}

async function* applyLimits(
  source: AsyncIterable<Uint8Array>,
  skip: number,
  limit: number,
): AsyncIterable<Uint8Array> {
  let pos = 0
  let remaining = limit
  for await (let chunk of source) {
    const len = chunk.byteLength
    if (pos + len <= skip) {
      pos += len
      continue
    }
    if (pos < skip) {
      chunk = chunk.subarray(skip - pos)
      pos = skip
    }
    if (remaining <= 0) break
    if (chunk.byteLength > remaining) chunk = chunk.subarray(0, remaining)
    yield chunk
    remaining -= chunk.byteLength
    pos += chunk.byteLength
  }
}

void padLeft

// eslint-disable-next-line @typescript-eslint/require-await
async function xxdCommand(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const cache: string[] = []
  let source: AsyncIterable<Uint8Array>
  if (paths.length > 0) {
    const first = paths[0]
    if (first === undefined) return [null, new IOResult()]
    source = opfsStream(accessor.rootHandle, first)
    cache.push(first.original)
  } else {
    try {
      source = resolveSource(opts.stdin, 'xxd: missing input')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
    }
  }
  const toInt = (v: string | boolean | undefined): number =>
    typeof v === 'string' ? Number.parseInt(v, 10) : 0
  const skip = toInt(opts.flags.s)
  const limitFlag = toInt(opts.flags.l)
  if (skip > 0 || limitFlag > 0) {
    const limit = limitFlag > 0 ? limitFlag : Number.MAX_SAFE_INTEGER
    source = applyLimits(source, skip, limit)
  }
  const uppercase = opts.flags.u === true
  if (opts.flags.r === true) return [xxdReverseStream(source), new IOResult({ cache })]
  if (opts.flags.p === true) return [xxdPlainStream(source, uppercase), new IOResult({ cache })]
  const cols = toInt(opts.flags.c) > 0 ? toInt(opts.flags.c) : 16
  const group = toInt(opts.flags.g) > 0 ? toInt(opts.flags.g) : 2
  return [xxdDumpStream(source, cols, group, uppercase), new IOResult({ cache })]
}

export const OPFS_XXD = command({
  name: 'xxd',
  resource: ResourceName.OPFS,
  spec: specOf('xxd'),
  fn: xxdCommand,
})
