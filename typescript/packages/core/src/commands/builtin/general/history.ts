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

import type { Accessor } from '../../../accessor/base.ts'
import { IOResult } from '../../../io/types.ts'
import type { PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

function historyCommand(
  _accessor: Accessor,
  _paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): CommandFnResult {
  const history = opts.history
  if (history === undefined) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode('history: not enabled for this workspace\n'),
      }),
    ]
  }
  const c = opts.flags.c === true
  if (c) {
    history.clear()
    return [null, new IOResult()]
  }
  const all = history.entries()
  const scoped =
    opts.sessionId !== undefined ? all.filter((r) => r.sessionId === opts.sessionId) : all
  let n: number | null = null
  if (texts.length > 0 && texts[0] !== undefined) {
    const parsed = Number.parseInt(texts[0], 10)
    if (Number.isNaN(parsed) || String(parsed) !== texts[0]) {
      return [
        null,
        new IOResult({
          exitCode: 1,
          stderr: ENC.encode(`history: ${texts[0]}: numeric argument required\n`),
        }),
      ]
    }
    n = parsed
  }
  const entries = n !== null && n >= 0 ? scoped.slice(-n) : scoped
  const total = scoped.length
  const startIdx = total - entries.length + 1
  const width = String(total).length
  const lines = entries.map(
    (rec, i) => `${String(startIdx + i).padStart(width, ' ')}  ${rec.command}`,
  )
  const output = lines.length > 0 ? lines.join('\n') + '\n' : ''
  return [ENC.encode(output), new IOResult()]
}

export const GENERAL_HISTORY = command({
  name: 'history',
  resource: null,
  spec: specOf('history'),
  fn: historyCommand,
})
