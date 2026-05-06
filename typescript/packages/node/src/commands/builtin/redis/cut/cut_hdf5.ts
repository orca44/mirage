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
  hdf5Cut,
  materialize,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as redisStream } from '../../../../core/redis/stream.ts'
import type { RedisAccessor } from '../../../../accessor/redis.ts'

const ENC = new TextEncoder()

async function cutHdf5Command(
  accessor: RedisAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('cut: missing operand\n') })]
  }
  const first = paths[0]
  if (first === undefined) return [null, new IOResult()]
  const fSpec = typeof opts.flags.f === 'string' ? opts.flags.f : ''
  const columns = fSpec.split(',').filter((c) => c.length > 0)
  if (columns.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('cut: -f required\n') })]
  }
  try {
    const raw = await materialize(redisStream(accessor, first))
    const result = await hdf5Cut(raw, columns)
    const out: ByteSource = result
    return [out, new IOResult({ cache: [first.stripPrefix] })]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode(`cut: ${first.original}: failed to read as hdf5: ${msg}\n`),
      }),
    ]
  }
}

export const RAM_CUT_HDF5 = command({
  name: 'cut',
  resource: ResourceName.REDIS,
  spec: specOf('cut'),
  filetype: '.h5',
  fn: cutHdf5Command,
})
