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
import { rmdir as redisRmdir } from '../../../core/redis/rmdir.ts'
import { stat as redisStat } from '../../../core/redis/stat.ts'
import { unlink as redisUnlink } from '../../../core/redis/unlink.ts'
import { rmR as redisRmR } from '../../../core/redis/rm.ts'
import type { RedisAccessor } from '../../../accessor/redis.ts'

async function rmCommand(
  accessor: RedisAccessor,
  paths: PathSpec[],
  texts: string[],
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
  for (const p of paths) {
    let isDir = false
    try {
      const st = await redisStat(accessor, p)
      isDir = st.type === FileType.DIRECTORY
    } catch {
      isDir = false
    }
    if (isDir) {
      if (recursive) {
        await redisRmR(accessor, p)
      } else {
        await redisRmdir(accessor, p)
      }
    } else {
      await redisUnlink(accessor, p)
    }
  }
  return [null, new IOResult()]
}

export const REDIS_RM = command({
  name: 'rm',
  resource: ResourceName.REDIS,
  spec: specOf('rm'),
  fn: rmCommand,
  write: true,
})
