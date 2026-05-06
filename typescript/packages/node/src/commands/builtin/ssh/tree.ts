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
  FileType,
  IOResult,
  PathSpec,
  ResourceName,
  command,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
} from '@struktoai/mirage-core'
import { readdir as sshReaddir } from '../../../core/ssh/readdir.ts'
import { stat as sshStat } from '../../../core/ssh/stat.ts'
import type { SSHAccessor } from '../../../accessor/ssh.ts'

interface TreeOpts {
  showHidden: boolean
  maxDepth: number | null
  ignorePattern: string | null
  dirsOnly: boolean
  matchPattern: string | null
}

function fnmatch(name: string, pattern: string): boolean {
  let re = '^'
  for (const ch of pattern) {
    if (ch === '*') re += '.*'
    else if (ch === '?') re += '.'
    else if (/[.+^${}()|[\]\\]/.test(ch)) re += '\\' + ch
    else re += ch
  }
  re += '$'
  return new RegExp(re).test(name)
}

async function walkTree(
  accessor: SSHAccessor,
  path: PathSpec,
  prefix: string,
  lines: string[],
  treeOpts: TreeOpts,
  depth: number,
): Promise<void> {
  let entries: string[]
  try {
    entries = await sshReaddir(accessor, path)
  } catch {
    return
  }
  entries.sort()
  const filtered: { spec: PathSpec; name: string; isDir: boolean }[] = []
  for (const childPath of entries) {
    const name = childPath.slice(childPath.lastIndexOf('/') + 1)
    if (!treeOpts.showHidden && name.startsWith('.')) continue
    if (treeOpts.ignorePattern !== null && fnmatch(name, treeOpts.ignorePattern)) continue
    const sub = new PathSpec({
      original: childPath,
      directory: childPath,
      resolved: false,
      prefix: path.prefix,
    })
    let isDir: boolean
    try {
      const s = await sshStat(accessor, sub)
      isDir = s.type === FileType.DIRECTORY
    } catch {
      continue
    }
    if (treeOpts.dirsOnly && !isDir) continue
    if (treeOpts.matchPattern !== null && !isDir && !fnmatch(name, treeOpts.matchPattern)) continue
    filtered.push({ spec: sub, name, isDir })
  }
  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i]
    if (entry === undefined) continue
    const last = i === filtered.length - 1
    const connector = last ? '└── ' : '├── '
    lines.push(`${prefix}${connector}${entry.name}`)
    if (entry.isDir) {
      if (treeOpts.maxDepth !== null && depth >= treeOpts.maxDepth) continue
      const nextPrefix = prefix + (last ? '    ' : '│   ')
      await walkTree(accessor, entry.spec, nextPrefix, lines, treeOpts, depth + 1)
    }
  }
}

async function treeCommand(
  accessor: SSHAccessor,
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
  const depthRaw = typeof opts.flags.L === 'string' ? opts.flags.L : null
  const ignoreRaw = typeof opts.flags.args_I === 'string' ? opts.flags.args_I : null
  const matchRaw = typeof opts.flags.P === 'string' ? opts.flags.P : null
  const treeOpts: TreeOpts = {
    showHidden: opts.flags.a === true,
    maxDepth: depthRaw === null ? null : Number.parseInt(depthRaw, 10),
    ignorePattern: ignoreRaw,
    dirsOnly: opts.flags.d === true,
    matchPattern: matchRaw,
  }
  const lines: string[] = []
  for (const p of targets) {
    await walkTree(accessor, p, '', lines, treeOpts, 0)
  }
  const out: ByteSource = new TextEncoder().encode(lines.join('\n'))
  return [out, new IOResult()]
}

export const SSH_TREE = command({
  name: 'tree',
  resource: ResourceName.SSH,
  spec: specOf('tree'),
  fn: treeCommand,
})
