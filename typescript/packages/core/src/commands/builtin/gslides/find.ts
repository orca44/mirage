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

import type { GSlidesAccessor } from '../../../accessor/gslides.ts'
import { resolveGlob } from '../../../core/gslides/glob.ts'
import { readdir as gslidesReaddir } from '../../../core/gslides/readdir.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { metadataProvision } from './provision.ts'

const ENC = new TextEncoder()

function fnmatch(name: string, pattern: string): boolean {
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '.')
    .replace(/\*/g, '.*')
  return new RegExp(`^${re}$`).test(name)
}

async function walk(
  accessor: GSlidesAccessor,
  path: PathSpec,
  index: CommandOpts['index'],
  maxDepth: number | null,
  depth: number,
): Promise<string[]> {
  if (maxDepth !== null && depth > maxDepth) return []
  let children: string[]
  try {
    children = await gslidesReaddir(accessor, path, index ?? undefined)
  } catch {
    return []
  }
  const results: string[] = []
  for (const child of children) {
    results.push(child)
    const isTerminal = child.endsWith('.json') || child.endsWith('.jsonl')
    if (!isTerminal) {
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
  accessor: GSlidesAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
  const p0 =
    resolved[0] ??
    new PathSpec({
      original: '/',
      directory: '/',
      resolved: false,
      prefix: opts.mountPrefix ?? '',
    })
  const nameFlag = typeof opts.flags.name === 'string' ? opts.flags.name : null
  const inameFlag = typeof opts.flags.iname === 'string' ? opts.flags.iname : null
  const maxDepthRaw = typeof opts.flags.maxdepth === 'string' ? opts.flags.maxdepth : null
  const minDepthRaw = typeof opts.flags.mindepth === 'string' ? opts.flags.mindepth : null
  const maxDepth = maxDepthRaw !== null ? Number.parseInt(maxDepthRaw, 10) : null
  const minDepth = minDepthRaw !== null ? Number.parseInt(minDepthRaw, 10) : null

  const allPaths = await walk(accessor, p0, opts.index, maxDepth, 0)
  const searchKey = p0.stripPrefix.replace(/^\/+|\/+$/g, '')
  const baseDepth = searchKey === '' ? -1 : searchKey.split('/').length - 1
  const results: string[] = []
  for (const p of [...allPaths].sort()) {
    const stripped = p.startsWith(p0.prefix) ? p.slice(p0.prefix.length) : p
    const trimmed = stripped.replace(/^\/+|\/+$/g, '')
    const depth = trimmed === '' ? -1 : trimmed.split('/').length - (baseDepth + 2)
    if (minDepth !== null && depth < minDepth) continue
    const entryName = p.split('/').pop() ?? p
    if (nameFlag !== null && !fnmatch(entryName, nameFlag)) continue
    if (inameFlag !== null && !fnmatch(entryName.toLowerCase(), inameFlag.toLowerCase())) continue
    results.push(p)
  }
  const out: ByteSource = ENC.encode(results.join('\n'))
  return [out, new IOResult()]
}

export const GSLIDES_FIND = command({
  name: 'find',
  resource: ResourceName.GSLIDES,
  spec: specOf('find'),
  fn: findCommand,
  provision: metadataProvision,
})
