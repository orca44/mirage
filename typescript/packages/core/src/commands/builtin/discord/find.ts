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

import type { DiscordAccessor } from '../../../accessor/discord.ts'
import type { IndexCacheStore } from '../../../cache/index/store.ts'
import { resolveDiscordGlob } from '../../../core/discord/glob.ts'
import { readdir as discordReaddir } from '../../../core/discord/readdir.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { metadataProvision } from './_provision.ts'

const ENC = new TextEncoder()

function fnmatch(name: string, pattern: string): boolean {
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '.')
    .replace(/\*/g, '.*')
  return new RegExp(`^${re}$`).test(name)
}

async function walk(
  accessor: DiscordAccessor,
  path: PathSpec,
  index: IndexCacheStore | undefined,
  maxDepth: number | null,
  depth: number,
): Promise<string[]> {
  if (maxDepth !== null && depth > maxDepth) return []
  let children: string[]
  try {
    children = await discordReaddir(accessor, path, index)
  } catch {
    return []
  }
  const results: string[] = []
  for (const child of children) {
    results.push(child)
    if (!child.endsWith('.json') && !child.endsWith('.jsonl')) {
      const childSpec = new PathSpec({
        original: child,
        directory: child,
        resolved: false,
        prefix: path.prefix,
      })
      const sub = await walk(accessor, childSpec, index, maxDepth, depth + 1)
      results.push(...sub)
    }
  }
  return results
}

async function findCommand(
  accessor: DiscordAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const resolved = await resolveDiscordGlob(accessor, paths, opts.index ?? undefined)
  const p0 = resolved[0]
  const searchPath = p0 !== undefined ? p0.original : '/'
  const searchPrefix = p0 !== undefined ? p0.prefix : ''
  const nameFlag = typeof opts.flags.name === 'string' ? opts.flags.name : null
  const inameFlag = typeof opts.flags.iname === 'string' ? opts.flags.iname : null
  const maxDepthFlag = typeof opts.flags.maxdepth === 'string' ? opts.flags.maxdepth : null
  const minDepthFlag = typeof opts.flags.mindepth === 'string' ? opts.flags.mindepth : null
  const md = maxDepthFlag !== null ? Number.parseInt(maxDepthFlag, 10) : null
  const mdMin = minDepthFlag !== null ? Number.parseInt(minDepthFlag, 10) : null
  const searchSpec = new PathSpec({
    original: searchPath,
    directory: searchPath,
    resolved: false,
    prefix: searchPrefix,
  })
  const allPaths = await walk(accessor, searchSpec, opts.index ?? undefined, md, 0)
  const stripped = searchPath.replace(/^\/+|\/+$/g, '')
  const baseDepth = stripped !== '' ? (stripped.match(/\//g)?.length ?? 0) : -1
  const sorted = [...allPaths].sort()
  const results: string[] = []
  for (const p of sorted) {
    const entryName = p.split('/').pop() ?? p
    const stripPath = p.replace(/^\/+|\/+$/g, '')
    const slashes = stripPath !== '' ? (stripPath.match(/\//g)?.length ?? 0) : 0
    const depth = slashes - (baseDepth + 1)
    if (mdMin !== null && depth < mdMin) continue
    if (nameFlag !== null && !fnmatch(entryName, nameFlag)) continue
    if (inameFlag !== null && !fnmatch(entryName.toLowerCase(), inameFlag.toLowerCase())) continue
    results.push(p)
  }
  const out: ByteSource = ENC.encode(results.join('\n'))
  return [out, new IOResult()]
}

export const DISCORD_FIND = command({
  name: 'find',
  resource: ResourceName.DISCORD,
  spec: specOf('find'),
  fn: findCommand,
  provision: metadataProvision,
})
