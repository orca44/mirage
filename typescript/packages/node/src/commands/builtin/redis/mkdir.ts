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
import { mkdir as redisMkdir } from '../../../core/redis/mkdir.ts'
import type { RedisAccessor } from '../../../accessor/redis.ts'

async function mkdirCommand(
  accessor: RedisAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const parents = opts.flags.p === true
  if (paths.length === 0) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: new TextEncoder().encode('mkdir: missing operand\n'),
      }),
    ]
  }
  for (const p of paths) {
    await redisMkdir(accessor, p, parents)
  }
  return [null, new IOResult()]
}

export const REDIS_MKDIR = command({
  name: 'mkdir',
  resource: ResourceName.REDIS,
  spec: specOf('mkdir'),
  fn: mkdirCommand,
  write: true,
})
