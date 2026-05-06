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
  materialize,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as diskStream } from '../../../core/disk/stream.ts'
import { writeBytes as diskWrite } from '../../../core/disk/write.ts'
import { exists as diskExists } from '../../../core/disk/exists.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

const ENC = new TextEncoder()

async function lnCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length < 2) {
    return [
      null,
      new IOResult({ exitCode: 1, stderr: ENC.encode('ln: usage: ln [-s] [-f] source dest\n') }),
    ]
  }
  const source = paths[0]
  const dest = paths[1]
  if (source === undefined || dest === undefined) return [null, new IOResult()]
  if (opts.flags.n === true && (await diskExists(accessor, dest))) {
    return [null, new IOResult()]
  }
  const data = await materialize(diskStream(accessor, source))
  await diskWrite(accessor, dest, data)
  const out: ByteSource | null =
    opts.flags.v === true ? ENC.encode(`'${source.original}' -> '${dest.original}'\n`) : null
  return [out, new IOResult({ writes: { [dest.stripPrefix]: data } })]
}

export const DISK_LN = command({
  name: 'ln',
  resource: ResourceName.DISK,
  spec: specOf('ln'),
  fn: lnCommand,
  write: true,
})
