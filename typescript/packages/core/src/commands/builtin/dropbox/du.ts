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

import type { DropboxAccessor } from '../../../accessor/dropbox.ts'
import { resolveGlob } from '../../../core/dropbox/glob.ts'
import { readdir as dropboxReaddir } from '../../../core/dropbox/readdir.ts'
import { stat as dropboxStat } from '../../../core/dropbox/stat.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { FileType, PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { humanSize } from '../utils/formatting.ts'
import { metadataProvision } from './provision.ts'

const ENC = new TextEncoder()

async function walkSize(
  accessor: DropboxAccessor,
  path: PathSpec,
  index: CommandOpts['index'],
): Promise<number> {
  let s: { type: FileType | null; size: number | null }
  try {
    s = await dropboxStat(accessor, path, index ?? undefined)
  } catch {
    return 0
  }
  if (s.type !== FileType.DIRECTORY) return s.size ?? 0
  let children: string[]
  try {
    children = await dropboxReaddir(accessor, path, index ?? undefined)
  } catch {
    return 0
  }
  let total = 0
  for (const child of children) {
    const trimmed = child.replace(/\/+$/, '')
    const childSpec = new PathSpec({
      original: trimmed,
      directory: trimmed,
      resolved: false,
      prefix: path.prefix,
    })
    total += await walkSize(accessor, childSpec, index)
  }
  return total
}

async function duCommand(
  accessor: DropboxAccessor,
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
  const human = opts.flags.h === true
  const summary = opts.flags.s === true
  const grandTotal = opts.flags.c === true
  const total = await walkSize(accessor, p0, opts.index)
  const fmt = (n: number): string => (human ? humanSize(n) : String(n))
  const lines: string[] = [`${fmt(total)}\t${p0.original}`]
  if (summary) {
    if (grandTotal) lines.push(`${fmt(total)}\ttotal`)
    const out: ByteSource = ENC.encode(lines.join('\n'))
    return [out, new IOResult()]
  }
  if (grandTotal) lines.push(`${fmt(total)}\ttotal`)
  const out: ByteSource = ENC.encode(lines.join('\n'))
  return [out, new IOResult()]
}

export const DROPBOX_DU = command({
  name: 'du',
  resource: ResourceName.DROPBOX,
  spec: specOf('du'),
  fn: duCommand,
  provision: metadataProvision,
})
