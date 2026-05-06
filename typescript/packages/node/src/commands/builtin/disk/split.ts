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
  PathSpec,
  ResourceName,
  command,
  resolveSource,
  specOf,
  type CommandFnResult,
  type CommandOpts,
} from '@struktoai/mirage-core'
import { writeBytes as diskWrite } from '../../../core/disk/write.ts'
import { stream as diskStream } from '../../../core/disk/stream.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

const ENC = new TextEncoder()

function alphaSuffix(index: number, length: number): string {
  const chars: string[] = []
  let n = index
  for (let i = 0; i < length; i++) {
    chars.push(String.fromCharCode('a'.charCodeAt(0) + (n % 26)))
    n = Math.floor(n / 26)
  }
  return chars.reverse().join('')
}

function numericSuffix(index: number, length: number): string {
  const s = String(index)
  return s.length >= length ? s : '0'.repeat(length - s.length) + s
}

function makePathSpec(original: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: true })
}

async function splitCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const prefixPath = paths.length >= 2 && paths[1] !== undefined ? paths[1].stripPrefix : 'x'
  const linesFlag = typeof opts.flags.l === 'string' ? opts.flags.l : null
  const bFlag = typeof opts.flags.b === 'string' ? opts.flags.b : null
  const nFlag = typeof opts.flags.n === 'string' ? opts.flags.n : null
  const aFlag = typeof opts.flags.a === 'string' ? opts.flags.a : null
  const dFlag = opts.flags.d === true
  const linesPerFile =
    linesFlag !== null
      ? Number.parseInt(linesFlag, 10)
      : bFlag === null && nFlag === null
        ? 1000
        : 0
  const byteLimit = bFlag !== null ? Number.parseInt(bFlag, 10) : 0
  const nChunks = nFlag !== null ? Number.parseInt(nFlag, 10) : 0
  const suffixLen = aFlag !== null ? Number.parseInt(aFlag, 10) : 2
  const suffixFn = dFlag ? numericSuffix : alphaSuffix

  let source: AsyncIterable<Uint8Array>
  const first = paths[0]
  if (first !== undefined) {
    source = diskStream(accessor, first)
  } else {
    try {
      source = resolveSource(opts.stdin, 'split: missing input')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
    }
  }

  const writes: Record<string, Uint8Array> = {}
  let fileIdx = 0

  if (nChunks > 0) {
    const chunks: Uint8Array[] = []
    let total = 0
    for await (const c of source) {
      chunks.push(c)
      total += c.byteLength
    }
    const allData = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      allData.set(c, offset)
      offset += c.byteLength
    }
    const chunkSize = Math.max(1, Math.ceil(total / nChunks))
    offset = 0
    for (let i = 0; i < nChunks; i++) {
      const part = allData.slice(offset, offset + chunkSize)
      if (part.byteLength === 0) break
      const outPath = prefixPath + suffixFn(i, suffixLen)
      await diskWrite(accessor, makePathSpec(outPath), part)
      writes[outPath] = part
      offset += chunkSize
    }
  } else if (byteLimit > 0) {
    let buf = new Uint8Array(0)
    for await (const c of source) {
      const merged = new Uint8Array(buf.byteLength + c.byteLength)
      merged.set(buf, 0)
      merged.set(c, buf.byteLength)
      buf = merged
      while (buf.byteLength >= byteLimit) {
        const outPath = prefixPath + suffixFn(fileIdx, suffixLen)
        const data = buf.slice(0, byteLimit)
        await diskWrite(accessor, makePathSpec(outPath), data)
        writes[outPath] = data
        buf = buf.slice(byteLimit)
        fileIdx += 1
      }
    }
    if (buf.byteLength > 0) {
      const outPath = prefixPath + suffixFn(fileIdx, suffixLen)
      await diskWrite(accessor, makePathSpec(outPath), buf)
      writes[outPath] = buf
    }
  } else {
    const lineBuf: Uint8Array[] = []
    const iter = new AsyncLineIterator(source)
    for await (const line of iter) {
      lineBuf.push(line)
      if (lineBuf.length >= linesPerFile) {
        const outPath = prefixPath + suffixFn(fileIdx, suffixLen)
        const data = joinLines(lineBuf)
        await diskWrite(accessor, makePathSpec(outPath), data)
        writes[outPath] = data
        lineBuf.length = 0
        fileIdx += 1
      }
    }
    if (lineBuf.length > 0) {
      const outPath = prefixPath + suffixFn(fileIdx, suffixLen)
      const data = joinLines(lineBuf)
      await diskWrite(accessor, makePathSpec(outPath), data)
      writes[outPath] = data
    }
  }
  return [null, new IOResult({ writes })]
}

function joinLines(lines: readonly Uint8Array[]): Uint8Array {
  let total = 0
  for (const l of lines) total += l.byteLength + 1
  const out = new Uint8Array(total)
  let offset = 0
  for (const l of lines) {
    out.set(l, offset)
    offset += l.byteLength
    out[offset] = 0x0a
    offset += 1
  }
  return out
}

export const DISK_SPLIT = command({
  name: 'split',
  resource: ResourceName.DISK,
  spec: specOf('split'),
  fn: splitCommand,
  write: true,
})
