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
import { readdir as redisReaddir } from '../../../core/redis/readdir.ts'
import type { RedisAccessor } from '../../../accessor/redis.ts'

async function walkTree(
  accessor: RedisAccessor,
  path: PathSpec,
  prefix: string,
  lines: string[],
): Promise<void> {
  let entries: string[]
  try {
    entries = await redisReaddir(accessor, path)
  } catch {
    return
  }
  entries.sort()
  for (let i = 0; i < entries.length; i++) {
    const childPath = entries[i]
    if (childPath === undefined) continue
    const last = i === entries.length - 1
    const connector = last ? '└── ' : '├── '
    const displayName = childPath.slice(childPath.lastIndexOf('/') + 1)
    lines.push(`${prefix}${connector}${displayName}`)
    const sub = new PathSpec({
      original: childPath,
      directory: childPath,
      resolved: false,
      prefix: path.prefix,
    })
    const nextPrefix = prefix + (last ? '    ' : '│   ')
    await walkTree(accessor, sub, nextPrefix, lines)
  }
}

async function treeCommand(
  accessor: RedisAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const targets =
    paths.length > 0
      ? paths
      : [
          new PathSpec({
            original: opts.cwd,
            directory: opts.cwd,
            resolved: false,
            prefix: opts.mountPrefix ?? '',
          }),
        ]
  const lines: string[] = []
  for (const p of targets) {
    await walkTree(accessor, p, '', lines)
  }
  const out: ByteSource = new TextEncoder().encode(lines.join('\n'))
  return [out, new IOResult()]
}

export const REDIS_TREE = command({
  name: 'tree',
  resource: ResourceName.REDIS,
  spec: specOf('tree'),
  fn: treeCommand,
})
