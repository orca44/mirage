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
import { du as diskDu, duAll as diskDuAll } from '../../../core/disk/du.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

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

function depthOf(entryPath: string, basePath: string): number {
  const base = basePath.replace(/\/+$/, '')
  const rel = entryPath.replace(/\/+$/, '').slice(base.length)
  if (!rel) return 0
  return (rel.replace(/^\/+|\/+$/g, '').match(/\//g) ?? []).length + 1
}

async function duCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const human = opts.flags.h === true
  const summarize = opts.flags.s === true
  const all = opts.flags.a === true
  const cumulative = opts.flags.c === true
  const maxDepthRaw = opts.flags['max-depth']
  const maxDepth = typeof maxDepthRaw === 'string' ? Number.parseInt(maxDepthRaw, 10) : null
  const fmt = (size: number): string => (human ? humanSize(size) : String(size))
  const targets =
    paths.length > 0 ? paths : [new PathSpec({ original: '/', directory: '/', resolved: false })]
  const path = targets[0]
  if (path === undefined) return [null, new IOResult()]

  if (summarize) {
    const total = await diskDu(accessor, path)
    let output = `${fmt(total)}\t${path.original}`
    if (cumulative) output += `\n${fmt(total)}\ttotal`
    return [new TextEncoder().encode(output) as ByteSource, new IOResult()]
  }

  const [allEntriesRaw, totalFromAll] = await diskDuAll(accessor, path)
  let entries = allEntriesRaw
  if (entries.length === 0) {
    const total = await diskDu(accessor, path)
    let output = `${fmt(total)}\t${path.original}`
    if (cumulative) output += `\n${fmt(total)}\ttotal`
    return [new TextEncoder().encode(output) as ByteSource, new IOResult()]
  }
  if (!all) {
    entries = entries.filter(([p]) => p === path.original)
  }
  if (maxDepth !== null) {
    entries = entries.filter(([p]) => depthOf(p, path.original) <= maxDepth)
  }
  if (entries.length === 0) {
    const total = totalFromAll !== 0 ? totalFromAll : await diskDu(accessor, path)
    let output = `${fmt(total)}\t${path.original}`
    if (cumulative) output += `\n${fmt(total)}\ttotal`
    return [new TextEncoder().encode(output) as ByteSource, new IOResult()]
  }
  const lines: string[] = entries.map(([p, sz]) => `${fmt(sz)}\t${p}`)
  if (cumulative) {
    const grand = entries.reduce((acc, [, sz]) => acc + sz, 0)
    lines.push(`${fmt(grand)}\ttotal`)
  }
  return [new TextEncoder().encode(lines.join('\n')) as ByteSource, new IOResult()]
}

export const DISK_DU = command({
  name: 'du',
  resource: ResourceName.DISK,
  spec: specOf('du'),
  fn: duCommand,
})
