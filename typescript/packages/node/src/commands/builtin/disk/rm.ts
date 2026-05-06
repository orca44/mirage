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
  FileType,
  IOResult,
  ResourceName,
  command,
  specOf,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { rmdir as diskRmdir } from '../../../core/disk/rmdir.ts'
import { stat as diskStat } from '../../../core/disk/stat.ts'
import { unlink as diskUnlink } from '../../../core/disk/unlink.ts'
import { rmR as diskRmR } from '../../../core/disk/rm.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

async function rmCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: new TextEncoder().encode('rm: missing operand\n'),
      }),
    ]
  }
  const recursive = opts.flags.r === true || opts.flags.R === true
  const force = opts.flags.f === true
  const verbose = opts.flags.v === true
  const lines: string[] = []
  for (const p of paths) {
    let isDir = false
    try {
      const st = await diskStat(accessor, p)
      isDir = st.type === FileType.DIRECTORY
    } catch {
      if (force) continue
      throw new Error(`rm: cannot remove '${p.original}': No such file or directory`)
    }
    if (isDir) {
      if (recursive) {
        await diskRmR(accessor, p)
      } else {
        await diskRmdir(accessor, p)
      }
    } else {
      await diskUnlink(accessor, p)
    }
    if (verbose) lines.push(`removed '${p.original}'`)
  }
  const out = lines.length > 0 ? new TextEncoder().encode(lines.join('\n')) : null
  return [out, new IOResult()]
}

export const DISK_RM = command({
  name: 'rm',
  resource: ResourceName.DISK,
  spec: specOf('rm'),
  fn: rmCommand,
  write: true,
})
