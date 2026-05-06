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
import { stat as gslidesStat } from '../../../core/gslides/stat.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import type { FileStat } from '../../../types.ts'
import { FileType, PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

function fnmatch(name: string, pattern: string): boolean {
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '.')
    .replace(/\*/g, '.*')
  return new RegExp(`^${re}$`).test(name)
}

interface TreeOpts {
  maxDepth: number | null
  showHidden: boolean
  ignorePattern: string | null
  dirsOnly: boolean
  matchPattern: string | null
}

async function treeRecurse(
  accessor: GSlidesAccessor,
  path: PathSpec,
  prefix: string,
  depth: number,
  treeOpts: TreeOpts,
  warnings: string[],
  indexCache: CommandOpts['index'],
): Promise<string[]> {
  const lines: string[] = []
  let entries: string[]
  try {
    entries = await gslidesReaddir(accessor, path, indexCache ?? undefined)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`tree: '${path.original}': ${msg}`)
    return lines
  }
  const filtered: [PathSpec, FileStat][] = []
  for (const entry of entries) {
    try {
      const entrySpec = new PathSpec({
        original: entry,
        directory: entry,
        resolved: false,
        prefix: path.prefix,
      })
      const s = await gslidesStat(accessor, entrySpec, indexCache ?? undefined)
      if (!treeOpts.showHidden && s.name.startsWith('.')) continue
      if (treeOpts.ignorePattern !== null && fnmatch(s.name, treeOpts.ignorePattern)) continue
      if (treeOpts.dirsOnly && s.type !== FileType.DIRECTORY) continue
      const notDir = s.type !== FileType.DIRECTORY
      if (treeOpts.matchPattern !== null && notDir && !fnmatch(s.name, treeOpts.matchPattern))
        continue
      filtered.push([entrySpec, s])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`tree: '${entry}': ${msg}`)
    }
  }
  for (let i = 0; i < filtered.length; i++) {
    const pair = filtered[i]
    if (pair === undefined) continue
    const [entrySpec, s] = pair
    const isLast = i === filtered.length - 1
    const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251c\u2500\u2500 '
    lines.push(prefix + connector + s.name)
    if (s.type === FileType.DIRECTORY) {
      if (treeOpts.maxDepth !== null && depth >= treeOpts.maxDepth) continue
      const extension = isLast ? '    ' : '\u2502   '
      const sub = await treeRecurse(
        accessor,
        entrySpec,
        prefix + extension,
        depth + 1,
        treeOpts,
        warnings,
        indexCache,
      )
      lines.push(...sub)
    }
  }
  return lines
}

async function treeCommand(
  accessor: GSlidesAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
  const p0 =
    resolved[0] ??
    new PathSpec({
      original: opts.cwd,
      directory: opts.cwd,
      resolved: false,
      prefix: opts.mountPrefix ?? '',
    })
  const maxDepth = typeof opts.flags.L === 'string' ? Number.parseInt(opts.flags.L, 10) : null
  const treeOpts: TreeOpts = {
    maxDepth,
    showHidden: opts.flags.a === true,
    ignorePattern: typeof opts.flags.args_I === 'string' ? opts.flags.args_I : null,
    dirsOnly: opts.flags.d === true,
    matchPattern: typeof opts.flags.P === 'string' ? opts.flags.P : null,
  }
  const warnings: string[] = []
  const results = await treeRecurse(accessor, p0, '', 0, treeOpts, warnings, opts.index)
  const out: ByteSource = ENC.encode(results.join('\n'))
  const stderr = warnings.length > 0 ? ENC.encode(warnings.join('\n')) : null
  return [out, new IOResult({ stderr })]
}

export const GSLIDES_TREE = command({
  name: 'tree',
  resource: ResourceName.GSLIDES,
  spec: specOf('tree'),
  fn: treeCommand,
})
