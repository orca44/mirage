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
  md5Hex,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { read as opfsRead } from '../../../core/opfs/read.ts'
import type { OPFSAccessor } from '../../../accessor/opfs.ts'

async function md5Command(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const lines: string[] = []
  if (paths.length > 0) {
    for (const p of paths) {
      const data = await opfsRead(accessor.rootHandle, p)
      lines.push(`${md5Hex(data)}  ${p.original}`)
    }
  } else if (opts.stdin !== null) {
    const data = await materialize(opts.stdin)
    lines.push(md5Hex(data))
  }
  const out: ByteSource = new TextEncoder().encode(lines.join('\n'))
  return [out, new IOResult()]
}

export const RAM_MD5 = command({
  name: 'md5',
  resource: ResourceName.OPFS,
  spec: specOf('md5'),
  fn: md5Command,
})
