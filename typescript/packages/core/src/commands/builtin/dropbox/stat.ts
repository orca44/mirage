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
import { stat as dropboxStat } from '../../../core/dropbox/stat.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { FileType, ResourceName, type FileStat, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { metadataProvision } from './provision.ts'

const ENC = new TextEncoder()

const TYPE_LABELS: Record<string, string> = {
  [FileType.DIRECTORY]: 'directory',
  [FileType.TEXT]: 'regular file',
  [FileType.BINARY]: 'regular file',
  [FileType.JSON]: 'regular file',
  [FileType.CSV]: 'regular file',
}

function formatStat(fmt: string, s: FileStat): string {
  return fmt.replace(/%(.)/g, (_, spec: string) => {
    if (spec === 'n') return s.name
    if (spec === 's') return String(s.size ?? 0)
    if (spec === 'F')
      return s.type !== null ? (TYPE_LABELS[s.type] ?? 'regular file') : 'regular file'
    if (spec === 'y') return s.modified ?? ''
    return '?'
  })
}

async function statCommand(
  accessor: DropboxAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('stat: missing operand\n') })]
  }
  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
  const fmt =
    typeof opts.flags.c === 'string'
      ? opts.flags.c
      : typeof opts.flags.f === 'string'
        ? opts.flags.f
        : null
  const lines: string[] = []
  for (const p of resolved) {
    const s = await dropboxStat(accessor, p, opts.index ?? undefined)
    if (fmt !== null) {
      lines.push(formatStat(fmt, s))
    } else {
      const sizeStr = s.size === null ? 'None' : String(s.size)
      const modStr = s.modified ?? 'None'
      const typeStr = s.type ?? 'None'
      lines.push(`name=${s.name} size=${sizeStr} modified=${modStr} type=${typeStr}`)
    }
  }
  const out: ByteSource = ENC.encode(lines.join('\n'))
  return [out, new IOResult()]
}

export const DROPBOX_STAT = command({
  name: 'stat',
  resource: ResourceName.DROPBOX,
  spec: specOf('stat'),
  fn: statCommand,
  provision: metadataProvision,
})
