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
  parquetLs,
  parquetLsFallback,
  materialize,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as redisStream } from '../../../../core/redis/stream.ts'
import { stat as redisStat } from '../../../../core/redis/stat.ts'
import type { RedisAccessor } from '../../../../accessor/redis.ts'

const ENC = new TextEncoder()

async function lsParquetCommand(
  accessor: RedisAccessor,
  paths: PathSpec[],
  _texts: string[],
  _opts: CommandOpts,
): Promise<CommandFnResult> {
  const [first] = paths
  if (first === undefined) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('ls: missing operand\n') })]
  }
  const stat = await redisStat(accessor, first)
  const meta = { size: stat.size ?? 0, modified: stat.modified, name: stat.name }
  try {
    const raw = await materialize(redisStream(accessor, first))
    const out: ByteSource = parquetLs(raw, meta)
    return [out, new IOResult({ cache: [first.stripPrefix] })]
  } catch {
    return [parquetLsFallback(meta), new IOResult()]
  }
}

export const REDIS_LS_PARQUET = command({
  name: 'ls',
  resource: ResourceName.REDIS,
  spec: specOf('ls'),
  filetype: '.parquet',
  fn: lsParquetCommand,
})
