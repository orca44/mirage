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

import type { LinearAccessor } from '../../../accessor/linear.ts'
import { resolveLinearGlob } from '../../../core/linear/glob.ts'
import { stat as linearStat } from '../../../core/linear/stat.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

function posixNormpath(p: string): string {
  const isAbs = p.startsWith('/')
  const parts = p.split('/')
  const out: string[] = []
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') {
        out.pop()
      } else if (!isAbs) {
        out.push('..')
      }
      continue
    }
    out.push(seg)
  }
  const joined = out.join('/')
  if (isAbs) return '/' + joined
  return joined === '' ? '.' : joined
}

async function existsPath(accessor: LinearAccessor, path: PathSpec): Promise<boolean> {
  try {
    await linearStat(accessor, path)
    return true
  } catch {
    return false
  }
}

async function realpathCommand(
  accessor: LinearAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const resolved =
    paths.length > 0 ? await resolveLinearGlob(accessor, paths, opts.index ?? undefined) : []
  const eFlag = opts.flags.e === true
  const mountPrefix = resolved[0]?.prefix ?? ''
  const lines: string[] = []
  for (const p of resolved) {
    const normalized = posixNormpath(p.original)
    if (eFlag) {
      const probe = new PathSpec({
        original: normalized,
        directory: normalized,
        resolved: false,
        prefix: mountPrefix,
      })
      if (!(await existsPath(accessor, probe))) {
        const msg = `realpath: '${p.original}': No such file or directory\n`
        return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(msg) })]
      }
    }
    lines.push(normalized)
  }
  const out: ByteSource = ENC.encode(lines.join('\n') + '\n')
  return [out, new IOResult()]
}

export const LINEAR_REALPATH = command({
  name: 'realpath',
  resource: ResourceName.LINEAR,
  spec: specOf('realpath'),
  fn: realpathCommand,
})
