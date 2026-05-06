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
  PathSpec,
  ResourceName,
  command,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
} from '@struktoai/mirage-core'
import { du as redisDu } from '../../../core/redis/du.ts'
import type { RedisAccessor } from '../../../accessor/redis.ts'

function humanSize(n: number): string {
  const units = ['', 'K', 'M', 'G', 'T']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  const s = v >= 10 || i === 0 ? Math.round(v).toString() : v.toFixed(1)
  return `${s}${units[i] ?? ''}`
}

async function duCommand(
  accessor: RedisAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const human = opts.flags.h === true
  const targets =
    paths.length > 0 ? paths : [new PathSpec({ original: '/', directory: '/', resolved: false })]
  const lines: string[] = []
  for (const root of targets) {
    let total = 0
    try {
      total = await redisDu(accessor, root)
    } catch {
      total = 0
    }
    const sizeStr = human ? humanSize(total) : String(total)
    lines.push(`${sizeStr}\t${root.original}`)
  }
  const out: ByteSource = new TextEncoder().encode(lines.join('\n'))
  return [out, new IOResult()]
}

export const REDIS_DU = command({
  name: 'du',
  resource: ResourceName.REDIS,
  spec: specOf('du'),
  fn: duCommand,
})
