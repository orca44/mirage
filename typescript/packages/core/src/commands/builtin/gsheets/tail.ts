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

import type { GSheetsAccessor } from '../../../accessor/gsheets.ts'
import { resolveGlob } from '../../../core/gsheets/glob.ts'
import { read as gsheetsRead } from '../../../core/gsheets/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { parseN, tailBytes } from '../tail_helper.ts'
import { readStdinAsync } from '../utils/stream.ts'
import { fileReadProvision } from './provision.ts'

const ENC = new TextEncoder()

async function tailCommand(
  accessor: GSheetsAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const [lines, plusMode] = parseN(typeof opts.flags.n === 'string' ? opts.flags.n : null)
  const bytesMode = typeof opts.flags.c === 'string' ? Number.parseInt(opts.flags.c, 10) : null
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    const raw = await gsheetsRead(accessor, first, opts.index ?? undefined)
    const out: ByteSource = tailBytes(raw, lines, bytesMode, plusMode)
    return [out, new IOResult()]
  }
  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tail: missing operand\n') })]
  }
  const out: ByteSource = tailBytes(raw, lines, bytesMode, plusMode)
  return [out, new IOResult()]
}

export const GSHEETS_TAIL = command({
  name: 'tail',
  resource: ResourceName.GSHEETS,
  spec: specOf('tail'),
  fn: tailCommand,
  provision: fileReadProvision,
})
