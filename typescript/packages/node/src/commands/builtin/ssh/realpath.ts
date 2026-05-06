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
  ResourceName,
  command,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import type { SSHAccessor } from '../../../accessor/ssh.ts'
import { stat as sshStat } from '../../../core/ssh/stat.ts'

function normalize(p: string, cwd: string): string {
  const path = p.startsWith('/') ? p : `${cwd.replace(/\/+$/, '')}/${p}`
  const parts = path.split('/').filter((s) => s !== '' && s !== '.')
  const out: string[] = []
  for (const part of parts) {
    if (part === '..') out.pop()
    else out.push(part)
  }
  return '/' + out.join('/')
}

async function existsSsh(accessor: SSHAccessor, p: PathSpec): Promise<boolean> {
  try {
    await sshStat(accessor, p)
    return true
  } catch {
    return false
  }
}

async function realpathCommand(
  accessor: SSHAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const requireExists = opts.flags.e === true
  const lines: string[] = []
  if (paths.length > 0) {
    for (const p of paths) {
      if (requireExists && !(await existsSsh(accessor, p))) {
        throw new Error(`realpath: '${p.original}': No such file or directory`)
      }
      lines.push(normalize(p.original, opts.cwd))
    }
  } else {
    for (const t of texts) lines.push(normalize(t, opts.cwd))
  }
  const out: ByteSource = new TextEncoder().encode(lines.join('\n') + '\n')
  return [out, new IOResult()]
}

export const SSH_REALPATH = command({
  name: 'realpath',
  resource: ResourceName.SSH,
  spec: specOf('realpath'),
  fn: realpathCommand,
})
