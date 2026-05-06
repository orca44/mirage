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
} from '@struktoai/mirage-core'
import { stream as opfsStream } from '../../../../core/opfs/stream.ts'
import type { OPFSAccessor } from '../../../../accessor/opfs.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function parseRangeSpec(spec: string): number[] {
  const out: number[] = []
  for (const part of spec.split(',')) {
    if (part.includes('-')) {
      const [loStr, hiStr] = part.split('-', 2) as [string, string]
      const lo = Number.parseInt(loStr, 10)
      const hi = Number.parseInt(hiStr, 10)
      for (let i = lo; i <= hi; i++) out.push(i)
    } else {
      out.push(Number.parseInt(part, 10))
    }
  }
  return out
}

function parseCharRanges(spec: string): [number, number][] {
  const ranges: [number, number][] = []
  for (const part of spec.split(',')) {
    if (part.includes('-')) {
      const [loStr, hiStr] = part.split('-', 2) as [string, string]
      ranges.push([Number.parseInt(loStr, 10), Number.parseInt(hiStr, 10)])
    } else {
      const val = Number.parseInt(part, 10)
      ranges.push([val, val])
    }
  }
  return ranges
}

async function* cutStream(
  source: AsyncIterable<Uint8Array>,
  delimiter: string,
  fields: number[] | null,
  chars: [number, number][] | null,
  complement: boolean,
  zeroTerminated: boolean,
): AsyncIterable<Uint8Array> {
  const raw = await materialize(source)
  const sep = zeroTerminated ? 0 : 0x0a
  const sepStr = zeroTerminated ? '\x00' : '\n'
  // Split raw bytes on sep, drop trailing empty record if present
  const records: Uint8Array[] = []
  let start = 0
  for (let i = 0; i < raw.byteLength; i++) {
    if (raw[i] === sep) {
      records.push(raw.subarray(start, i))
      start = i + 1
    }
  }
  if (start < raw.byteLength) {
    records.push(raw.subarray(start))
  }
  for (const rec of records) {
    const line = DEC.decode(rec)
    if (chars !== null) {
      if (complement) {
        const selectedIndices = new Set<number>()
        for (const [s, e] of chars) {
          for (let i = s - 1; i < e; i++) selectedIndices.add(i)
        }
        const parts: string[] = []
        for (let i = 0; i < line.length; i++) {
          if (!selectedIndices.has(i)) {
            const ch = line.charAt(i)
            if (ch !== '') parts.push(ch)
          }
        }
        yield ENC.encode(parts.join('') + sepStr)
      } else {
        const parts: string[] = []
        for (const [s, e] of chars) {
          parts.push(line.slice(s - 1, e))
        }
        yield ENC.encode(parts.join('') + sepStr)
      }
    } else if (fields !== null && fields.length > 0) {
      const partsF = line.split(delimiter)
      let selected: string[]
      if (complement) {
        const fieldSet = new Set(fields)
        selected = partsF.filter((_, i) => !fieldSet.has(i + 1))
      } else {
        selected = []
        for (const f of fields) {
          const part = partsF[f - 1]
          if (part !== undefined) selected.push(part)
        }
      }
      yield ENC.encode(selected.join(delimiter) + sepStr)
    } else {
      const out = new Uint8Array(rec.byteLength + 1)
      out.set(rec, 0)
      out[rec.byteLength] = sep
      yield out
    }
  }
}

function cutCommand(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): CommandFnResult {
  const f = typeof opts.flags.f === 'string' ? opts.flags.f : null
  const d = typeof opts.flags.d === 'string' ? opts.flags.d : null
  const c = typeof opts.flags.c === 'string' ? opts.flags.c : null
  const complement = opts.flags.complement === true
  const z = opts.flags.z === true
  const fields = f !== null ? parseRangeSpec(f) : null
  const chars = c !== null ? parseCharRanges(c) : null
  const delim = d ?? '\t'

  let source: AsyncIterable<Uint8Array>
  const cache: string[] = []
  if (paths.length > 0) {
    const first = paths[0]
    if (first === undefined) return [null, new IOResult()]
    source = opfsStream(accessor.rootHandle, first)
    cache.push(first.original)
  } else {
    try {
      source = resolveSource(opts.stdin, 'cut: missing operand')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
    }
  }
  const out: ByteSource = cutStream(source, delim, fields, chars, complement, z)
  return [out, new IOResult({ cache })]
}

export const OPFS_CUT = command({
  name: 'cut',
  resource: ResourceName.OPFS,
  spec: specOf('cut'),
  fn: cutCommand,
})
