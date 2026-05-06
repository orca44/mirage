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
import { rename as opfsRename } from '../../../core/opfs/rename.ts'
import type { OPFSAccessor } from '../../../accessor/opfs.ts'

async function mvCommand(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  _texts: string[],
  _opts: CommandOpts,
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
  const sources = paths.slice(0, -1)
  const dst = paths[paths.length - 1]
  if (dst === undefined) return [null, new IOResult()]
  for (const src of sources) {
    await opfsRename(accessor.rootHandle, src, dst)
  }
  return [null, new IOResult()]
}

export const OPFS_MV = command({
  name: 'mv',
  resource: ResourceName.OPFS,
  spec: specOf('mv'),
  fn: mvCommand,
  write: true,
})
