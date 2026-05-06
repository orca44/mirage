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

import type { PathSpec } from '../../../types.ts'
import type { Accessor } from '../../../accessor/base.ts'
import { IOResult } from '../../../io/types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

async function sleepCommand(
  _accessor: Accessor,
  _paths: PathSpec[],
  texts: string[],
  _opts: CommandOpts,
): Promise<CommandFnResult> {
  const arg = texts[0]
  if (arg === undefined) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: new TextEncoder().encode('sleep: missing operand\n'),
      }),
    ]
  }
  const seconds = Number.parseFloat(arg)
  if (!Number.isFinite(seconds) || seconds < 0) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: new TextEncoder().encode(`sleep: invalid time interval '${arg}'\n`),
      }),
    ]
  }
  await new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000))
  return [null, new IOResult()]
}

export const GENERAL_SLEEP = command({
  name: 'sleep',
  resource: null,
  spec: specOf('sleep'),
  fn: sleepCommand,
})
