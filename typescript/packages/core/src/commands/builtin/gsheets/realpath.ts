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

import type { GSheetsAccessor } from '../../../accessor/gsheets.ts'
import { stat as gsheetsStat } from '../../../core/gsheets/stat.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

function normalize(p: string): string {
  const isAbs = p.startsWith('/')
  const segments = p.split('/').filter((s) => s !== '' && s !== '.')
  const out: string[] = []
  for (const s of segments) {
    if (s === '..') {
      if (out.length > 0) out.pop()
      else if (!isAbs) out.push('..')
    } else {
      out.push(s)
    }
  }
  const joined = out.join('/')
  return isAbs ? '/' + joined : joined === '' ? '.' : joined
}

async function exists(
  accessor: GSheetsAccessor,
  path: string,
  index: CommandOpts['index'],
  prefix: string,
): Promise<boolean> {
  try {
    const spec = new PathSpec({ original: path, directory: path, prefix })
    await gsheetsStat(accessor, spec, index ?? undefined)
    return true
  } catch {
    return false
  }
}

async function realpathCommand(
  accessor: GSheetsAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const prefix = opts.mountPrefix ?? ''
  const e = opts.flags.e === true
  const lines: string[] = []
  for (const p of paths) {
    const full = prefix !== '' ? prefix + p.original : p.original
    const resolved = normalize(full)
    if (e && !(await exists(accessor, resolved, opts.index, prefix))) {
      const msg = `realpath: '${p.original}': No such file or directory\n`
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(msg) })]
    }
    lines.push(resolved)
  }
  const out: ByteSource = ENC.encode(lines.join('\n') + '\n')
  return [out, new IOResult()]
}

export const GSHEETS_REALPATH = command({
  name: 'realpath',
  resource: ResourceName.GSHEETS,
  spec: specOf('realpath'),
  fn: realpathCommand,
})
