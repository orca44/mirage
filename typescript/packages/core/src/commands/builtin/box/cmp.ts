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

import type { BoxAccessor } from '../../../accessor/box.ts'
import { resolveGlob } from '../../../core/box/glob.ts'
import { read as boxRead } from '../../../core/box/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { fileReadProvision } from './provision.ts'

const ENC = new TextEncoder()

function octal(n: number): string {
  return '0o' + n.toString(8)
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}

async function cmpCommand(
  accessor: BoxAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length < 2) {
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode('cmp: requires two paths\n') })]
  }
  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
  const p0 = resolved[0]
  const p1 = resolved[1]
  if (p0 === undefined || p1 === undefined) return [null, new IOResult()]
  let data1 = await boxRead(accessor, p0, opts.index ?? undefined)
  let data2 = await boxRead(accessor, p1, opts.index ?? undefined)
  if (typeof opts.flags.i === 'string') {
    const skip = Number.parseInt(opts.flags.i, 10)
    data1 = data1.slice(skip)
    data2 = data2.slice(skip)
  }
  if (typeof opts.flags.n === 'string') {
    const limit = Number.parseInt(opts.flags.n, 10)
    data1 = data1.slice(0, limit)
    data2 = data2.slice(0, limit)
  }
  if (arraysEqual(data1, data2)) return [null, new IOResult()]
  if (opts.flags.s === true) return [null, new IOResult({ exitCode: 1 })]
  if (opts.flags.args_l === true) {
    const outLines: string[] = []
    const limit = Math.min(data1.byteLength, data2.byteLength)
    for (let idx = 0; idx < limit; idx++) {
      if (data1[idx] !== data2[idx]) {
        outLines.push(`${String(idx + 1)} ${octal(data1[idx] ?? 0)} ${octal(data2[idx] ?? 0)}`)
      }
    }
    const out: ByteSource = ENC.encode(outLines.join('\n'))
    return [out, new IOResult({ exitCode: 1 })]
  }
  const limit = Math.min(data1.byteLength, data2.byteLength)
  for (let idx = 0; idx < limit; idx++) {
    if (data1[idx] !== data2[idx]) {
      let line = 1
      for (let k = 0; k < idx; k++) if (data1[k] === 0x0a) line += 1
      let msg = `${p0.original} ${p1.original} differ: byte ${String(idx + 1)}, line ${String(line)}`
      if (opts.flags.b === true) {
        msg += ` is ${octal(data1[idx] ?? 0)} ${String.fromCharCode(data1[idx] ?? 0)} ${octal(data2[idx] ?? 0)} ${String.fromCharCode(data2[idx] ?? 0)}`
      }
      return [ENC.encode(msg), new IOResult({ exitCode: 1 })]
    }
  }
  const shorter = data1.byteLength < data2.byteLength ? p0 : p1
  return [ENC.encode(`cmp: EOF on ${shorter.original}`), new IOResult({ exitCode: 1 })]
}

export const BOX_CMP = command({
  name: 'cmp',
  resource: ResourceName.BOX,
  spec: specOf('cmp'),
  fn: cmpCommand,
  provision: fileReadProvision,
})
