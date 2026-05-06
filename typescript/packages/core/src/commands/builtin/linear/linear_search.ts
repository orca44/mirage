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

import type { LinearAccessor } from '../../../accessor/linear.ts'
import { searchIssues } from '../../../core/linear/_client.ts'
import { IOResult } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { CommandSpec, OperandKind, Option } from '../../spec/types.ts'

const ENC = new TextEncoder()

const SPEC = new CommandSpec({
  options: [new Option({ long: '--query', valueKind: OperandKind.TEXT })],
})

async function linearSearchCommand(
  accessor: LinearAccessor,
  _paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const query = opts.flags.query
  if (typeof query !== 'string' || query === '') {
    throw new Error('--query is required')
  }
  const results = await searchIssues(accessor.transport, query)
  return [ENC.encode(JSON.stringify(results, null, 2)), new IOResult()]
}

export const LINEAR_SEARCH = command({
  name: 'linear-search',
  resource: ResourceName.LINEAR,
  spec: SPEC,
  fn: linearSearchCommand,
})
