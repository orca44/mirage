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

async function cutCommand(
  accessor: GDriveAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const fields = typeof opts.flags.f === 'string' ? parseRangeSpec(opts.flags.f) : null
  const chars = typeof opts.flags.c === 'string' ? parseCharRanges(opts.flags.c) : null
  const delim = typeof opts.flags.d === 'string' ? opts.flags.d : '\t'
  const complement = opts.flags.complement === true
  const zero = opts.flags.z === true

  let raw: Uint8Array | null = null
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    raw = await gdriveRead(accessor, first, opts.index ?? undefined)
  } else {
    raw = await readStdinAsync(opts.stdin)
    if (raw === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('cut: missing operand\n') })]
    }
  }
  const sep = zero ? '\x00' : '\n'
  const records = DEC.decode(raw).split(sep)
  if (records.length > 0 && records[records.length - 1] === '') records.pop()
  const outLines: string[] = []
  for (const line of records) {
    if (chars !== null) {
      if (complement) {
        const selectedIndices = new Set<number>()
        for (const [s, e] of chars) {
          for (let i = s - 1; i < e; i++) selectedIndices.add(i)
        }
        const parts: string[] = []
        for (let i = 0; i < line.length; i++) {
          if (!selectedIndices.has(i)) parts.push(line.charAt(i))
        }
        outLines.push(parts.join(''))
      } else {
        const parts: string[] = []
        for (const [s, e] of chars) parts.push(line.slice(s - 1, e))
        outLines.push(parts.join(''))
      }
    } else if (fields !== null && fields.length > 0) {
      const partsF = line.split(delim)
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
      outLines.push(selected.join(delim))
    } else {
      outLines.push(line)
    }
  }
  const out: ByteSource = ENC.encode(outLines.join(sep) + sep)
  return [out, new IOResult()]
}

export const GDRIVE_CUT = command({
  name: 'cut',
  resource: ResourceName.GDRIVE,
  spec: specOf('cut'),
  fn: cutCommand,
})
