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
  ProvisionResult,
  ResourceName,
  command,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type FileStat,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stat as sshStat } from '../../../../core/ssh/stat.ts'
import type { SSHAccessor } from '../../../../accessor/ssh.ts'

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
    if (spec === 'F') return s.type ? (TYPE_LABELS[s.type] ?? 'regular file') : 'regular file'
    if (spec === 'y') return s.modified ?? ''
    return '?'
  })
}

export function statProvision(
  accessor: SSHAccessor,
  paths: PathSpec[],
  _texts: string[],
  _opts: CommandOpts,
): ProvisionResult {
  const [first] = paths
  return new ProvisionResult({
    command: first !== undefined ? `stat ${first.original}` : 'stat',
  })
}

async function statCommand(
  accessor: SSHAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: new TextEncoder().encode('stat: missing operand\n'),
      }),
    ]
  }
  const fmt =
    typeof opts.flags.c === 'string'
      ? opts.flags.c
      : typeof opts.flags.f === 'string'
        ? opts.flags.f
        : null
  const lines: string[] = []
  for (const p of paths) {
    const s = await sshStat(accessor, p)
    if (fmt !== null) {
      lines.push(formatStat(fmt, s))
    } else {
      const sizeStr = s.size === null ? 'None' : String(s.size)
      const modStr = s.modified ?? 'None'
      const typeStr = s.type ?? 'None'
      lines.push(`name=${s.name} size=${sizeStr} modified=${modStr} type=${typeStr}`)
    }
  }
  const out: ByteSource = new TextEncoder().encode(lines.join('\n'))
  return [out, new IOResult()]
}

export const SSH_STAT = command({
  name: 'stat',
  resource: ResourceName.SSH,
  spec: specOf('stat'),
  fn: statCommand,
  provision: statProvision,
})
