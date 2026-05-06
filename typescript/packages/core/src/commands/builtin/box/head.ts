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
import { readStdinAsync } from '../utils/stream.ts'
import { fileReadProvision } from './provision.ts'

const ENC = new TextEncoder()

function headBytes(data: Uint8Array, lines: number, bytesMode: number | null): Uint8Array {
  if (bytesMode !== null) return data.slice(0, bytesMode)
  let count = 0
  let end = 0
  for (let i = 0; i < data.byteLength && count < lines; i++) {
    if (data[i] === 0x0a) {
      count += 1
      end = i + 1
    }
  }
  if (count < lines) return data
  return data.slice(0, end - 1)
}

async function headCommand(
  accessor: BoxAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const lines = typeof opts.flags.n === 'string' ? Number.parseInt(opts.flags.n, 10) : 10
  const bytesMode = typeof opts.flags.c === 'string' ? Number.parseInt(opts.flags.c, 10) : null
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    const data = await boxRead(accessor, first, opts.index ?? undefined)
    const out: ByteSource = headBytes(data, lines, bytesMode)
    return [out, new IOResult()]
  }
  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('head: missing operand\n') })]
  }
  const out: ByteSource = headBytes(raw, lines, bytesMode)
  return [out, new IOResult()]
}

export const BOX_HEAD = command({
  name: 'head',
  resource: ResourceName.BOX,
  spec: specOf('head'),
  fn: headCommand,
  provision: fileReadProvision,
})
