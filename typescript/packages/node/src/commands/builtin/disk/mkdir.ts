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
  specOf,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { mkdir as diskMkdir } from '../../../core/disk/mkdir.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

async function mkdirCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const parents = opts.flags.p === true
  const verbose = opts.flags.v === true
  if (paths.length === 0) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: new TextEncoder().encode('mkdir: missing operand\n'),
      }),
    ]
  }
  const lines: string[] = []
  for (const p of paths) {
    await diskMkdir(accessor, p, parents)
    if (verbose) lines.push(`mkdir: created directory '${p.original}'`)
  }
  const out = lines.length > 0 ? new TextEncoder().encode(lines.join('\n') + '\n') : null
  return [out, new IOResult()]
}

export const DISK_MKDIR = command({
  name: 'mkdir',
  resource: ResourceName.DISK,
  spec: specOf('mkdir'),
  fn: mkdirCommand,
  write: true,
})
