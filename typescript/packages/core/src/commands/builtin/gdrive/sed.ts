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
import { executeProgram, parseOneCommand, parseProgram } from '../sed_helper.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

async function sedCommand(
  accessor: GDriveAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (opts.flags.i === true) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode('sed -i not supported on read-only Google Drive mount\n'),
      }),
    ]
  }
  if (texts.length === 0 || texts[0] === undefined) {
    return [
      null,
      new IOResult({ exitCode: 2, stderr: ENC.encode('sed: usage: sed EXPRESSION [path]\n') }),
    ]
  }
  const expression = texts[0]
  const cmds =
    expression.includes(';') || expression.includes('{')
      ? parseProgram(expression)
      : [parseOneCommand(expression)[0]]
  const suppress = opts.flags.n === true

  let text: string
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    text = DEC.decode(await gdriveRead(accessor, first, opts.index ?? undefined))
  } else {
    const raw = await readStdinAsync(opts.stdin)
    if (raw === null) {
      return [
        null,
        new IOResult({ exitCode: 2, stderr: ENC.encode('sed: usage: sed EXPRESSION path\n') }),
      ]
    }
    text = DEC.decode(raw)
  }
  const out: ByteSource = ENC.encode(executeProgram(text, cmds, suppress))
  return [out, new IOResult()]
}

export const GDRIVE_SED = command({
  name: 'sed',
  resource: ResourceName.GDRIVE,
  spec: specOf('sed'),
  fn: sedCommand,
})
