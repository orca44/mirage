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

import type { PostgresAccessor } from '../../../accessor/postgres.ts'
import { resolveGlob } from '../../../core/postgres/glob.ts'
import { read as postgresRead } from '../../../core/postgres/read.ts'
import { type ByteSource, IOResult } from '../../../io/types.ts'
import { type PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'
import { fileReadProvision } from './_provision.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function numberLines(data: Uint8Array): Uint8Array {
  const text = DEC.decode(data)
  const lines = text.split('\n')
  const trailing = text.endsWith('\n')
  const limit = trailing ? lines.length - 1 : lines.length
  const out: string[] = []
  for (let i = 0; i < limit; i++) {
    out.push(`     ${String(i + 1)}\t${lines[i] ?? ''}\n`)
  }
  return ENC.encode(out.join(''))
}

async function catCommand(
  accessor: PostgresAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nFlag = opts.flags.n === true
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    let data: Uint8Array
    try {
      data = await postgresRead(accessor, first, opts.index ?? undefined)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(msg) })]
    }
    const out: ByteSource = nFlag ? numberLines(data) : data
    const io = new IOResult({
      reads: { [first.stripPrefix]: data },
      cache: [first.stripPrefix],
    })
    return [out, io]
  }
  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('cat: missing operand\n') })]
  }
  const out: ByteSource = nFlag ? numberLines(raw) : raw
  return [out, new IOResult()]
}

export const POSTGRES_CAT = command({
  name: 'cat',
  resource: ResourceName.POSTGRES,
  spec: specOf('cat'),
  fn: catCommand,
  provision: fileReadProvision,
})
