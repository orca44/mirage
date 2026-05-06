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

import { rename as ramRename } from '../../../core/ram/rename.ts'
import { stat as ramStat } from '../../../core/ram/stat.ts'
import type { RAMAccessor } from '../../../accessor/ram.ts'
import { IOResult } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

async function exists(accessor: RAMAccessor, path: PathSpec): Promise<boolean> {
  try {
    await ramStat(accessor, path)
    return true
  } catch {
    return false
  }
}

async function mvCommand(
  accessor: RAMAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length < 2) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: new TextEncoder().encode('mv: missing operand\n'),
      }),
    ]
  }
  const noClobber = opts.flags.n === true
  const verbose = opts.flags.v === true
  const sources = paths.slice(0, -1)
  const dst = paths[paths.length - 1]
  if (dst === undefined) return [null, new IOResult()]
  const lines: string[] = []
  for (const src of sources) {
    if (noClobber && (await exists(accessor, dst))) continue
    await ramRename(accessor, src, dst)
    if (verbose) lines.push(`'${src.original}' -> '${dst.original}'`)
  }
  const out = lines.length > 0 ? new TextEncoder().encode(lines.join('\n') + '\n') : null
  return [out, new IOResult()]
}

export const RAM_MV = command({
  name: 'mv',
  resource: ResourceName.RAM,
  spec: specOf('mv'),
  fn: mvCommand,
  write: true,
})
