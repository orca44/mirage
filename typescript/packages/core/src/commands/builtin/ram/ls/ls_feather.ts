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

import { stream as ramStream } from '../../../../core/ram/stream.ts'
import { stat as ramStat } from '../../../../core/ram/stat.ts'
import type { RAMAccessor } from '../../../../accessor/ram.ts'
import {
  ls as featherLs,
  lsFallback as featherLsFallback,
} from '../../../../core/filetype/feather.ts'
import { IOResult, materialize, type ByteSource } from '../../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../../config.ts'
import { specOf } from '../../../spec/builtins.ts'

const ENC = new TextEncoder()

async function lsFeatherCommand(
  accessor: RAMAccessor,
  paths: PathSpec[],
  _texts: string[],
  _opts: CommandOpts,
): Promise<CommandFnResult> {
  const [first] = paths
  if (first === undefined) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('ls: missing operand\n') })]
  }
  const stat = await ramStat(accessor, first)
  const meta = { size: stat.size ?? 0, modified: stat.modified, name: stat.name }
  try {
    const raw = await materialize(ramStream(accessor, first))
    const out: ByteSource = featherLs(raw, meta)
    return [out, new IOResult({ cache: [first.stripPrefix] })]
  } catch {
    return [featherLsFallback(meta), new IOResult()]
  }
}

export const RAM_LS_FEATHER = [
  ...command({
    name: 'ls',
    resource: ResourceName.RAM,
    spec: specOf('ls'),
    filetype: '.arrow',
    fn: lsFeatherCommand,
  }),
  ...command({
    name: 'ls',
    resource: ResourceName.RAM,
    spec: specOf('ls'),
    filetype: '.ipc',
    fn: lsFeatherCommand,
  }),
  ...command({
    name: 'ls',
    resource: ResourceName.RAM,
    spec: specOf('ls'),
    filetype: '.feather',
    fn: lsFeatherCommand,
  }),
]
