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
  featherWc,
} from '@struktoai/mirage-core'
import { stream as redisStream } from '../../../../core/redis/stream.ts'
import type { RedisAccessor } from '../../../../accessor/redis.ts'

const ENC = new TextEncoder()

async function wcFeatherCommand(
  accessor: RedisAccessor,
  paths: PathSpec[],
  _texts: string[],
  _opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('wc: missing operand\n') })]
  }
  const first = paths[0]
  if (first === undefined) return [null, new IOResult()]
  try {
    const raw = await materialize(redisStream(accessor, first))
    const rows = featherWc(raw)
    const out: ByteSource = ENC.encode(`${String(rows)}\t${first.original}\n`)
    return [out, new IOResult({ cache: [first.stripPrefix] })]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode(`wc: ${first.original}: failed to read as feather: ${msg}\n`),
      }),
    ]
  }
}

export const REDIS_WC_FEATHER = command({
  name: 'wc',
  resource: ResourceName.REDIS,
  spec: specOf('wc'),
  filetype: '.feather',
  fn: wcFeatherCommand,
})
