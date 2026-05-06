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
import { read as gdriveRead } from '../../../core/gdrive/read.ts'
import { stat as featherStat } from '../../../core/filetype/feather.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

async function statFeatherCommand(
  accessor: GDriveAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('stat: missing operand\n') })]
  }
  const first = paths[0]
  if (first === undefined) return [null, new IOResult()]
  try {
    const raw = await gdriveRead(accessor, first, opts.index ?? undefined)
    const out: ByteSource = featherStat(raw)
    return [out, new IOResult({ cache: [first.stripPrefix] })]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode(`stat: ${first.original}: failed to read as feather: ${msg}\n`),
      }),
    ]
  }
}

export const GDRIVE_STAT_FEATHER = command({
  name: 'stat',
  resource: ResourceName.GDRIVE,
  spec: specOf('stat'),
  filetype: '.feather',
  fn: statFeatherCommand,
})
