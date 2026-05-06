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

import type { GitHubAccessor } from '../../../accessor/github.ts'
import { du as s3Du, duAll as s3DuAll } from '../../../core/github/du.ts'
import { resolveGlob } from '../../../core/github/glob.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { humanSize } from '../utils/formatting.ts'

const ENC = new TextEncoder()

function formatSize(size: number, human: boolean): string {
  return human ? humanSize(size) : String(size)
}

function depth(entryPath: string, basePath: string): number {
  const base = basePath.replace(/\/+$/, '')
  const rel = entryPath.replace(/\/+$/, '').slice(base.length)
  if (rel === '') return 0
  return (rel.replace(/^\/+|\/+$/g, '').match(/\//g) ?? []).length + 1
}

async function duCommand(
  accessor: GitHubAccessor,
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
  const human = opts.flags.h === true
  const summarize = opts.flags.s === true
  const all = opts.flags.a === true
  const cumulate = opts.flags.c === true
  const maxDepthFlag =
    typeof opts.flags.max_depth === 'string'
      ? opts.flags.max_depth
      : typeof opts.flags['max-depth'] === 'string'
        ? opts.flags['max-depth']
        : null

  if (summarize) {
    const total = await s3Du(accessor, p0)
    let output = formatSize(total, human) + '\t' + p0.original
    if (cumulate) output += '\n' + formatSize(total, human) + '\ttotal'
    return [ENC.encode(output), new IOResult()]
  }
  let allEntries = await s3DuAll(accessor, p0)
  if (allEntries.length === 0) {
    const total = await s3Du(accessor, p0)
    let output = formatSize(total, human) + '\t' + p0.original
    if (cumulate) output += '\n' + formatSize(total, human) + '\ttotal'
    return [ENC.encode(output), new IOResult()]
  }
  if (!all) {
    allEntries = allEntries.filter(([p]) => p === p0.original)
  }
  if (maxDepthFlag !== null) {
    const md = Number.parseInt(maxDepthFlag, 10)
    allEntries = allEntries.filter(([p]) => depth(p, p0.original) <= md)
  }
  if (allEntries.length === 0) {
    const total = await s3Du(accessor, p0)
    let output = formatSize(total, human) + '\t' + p0.original
    if (cumulate) output += '\n' + formatSize(total, human) + '\ttotal'
    return [ENC.encode(output), new IOResult()]
  }
  const lines = allEntries.map(([p, sz]) => formatSize(sz, human) + '\t' + p)
  if (cumulate) {
    const grand = allEntries.reduce((sum, [, sz]) => sum + sz, 0)
    lines.push(formatSize(grand, human) + '\ttotal')
  }
  const out: ByteSource = ENC.encode(lines.join('\n'))
  return [out, new IOResult()]
}

export const GITHUB_DU = command({
  name: 'du',
  resource: ResourceName.GITHUB,
  spec: specOf('du'),
  fn: duCommand,
})
