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

import type { TrelloAccessor } from '../../../accessor/trello.ts'
import {
  concatBytes,
  formatJqOutput,
  jqEval,
  parseJsonAuto,
  parseJsonPath,
} from '../../../core/jq/index.ts'
import { resolveTrelloGlob } from '../../../core/trello/glob.ts'
import { read as trelloRead } from '../../../core/trello/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()

async function jqCommand(
  accessor: TrelloAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const expression = texts[0]
  if (expression === undefined) {
    return [
      null,
      new IOResult({ exitCode: 1, stderr: ENC.encode('jq: usage: jq EXPRESSION [path]\n') }),
    ]
  }
  const raw = opts.flags.r === true
  const compact = opts.flags.c === true
  const slurp = opts.flags.s === true
  const spread = expression.includes('[]')

  if (paths.length > 0) {
    const resolved = await resolveTrelloGlob(accessor, paths, opts.index ?? undefined)
    const outputs: Uint8Array[] = []
    for (const p of resolved) {
      const bytes = await trelloRead(accessor, p, opts.index ?? undefined)
      let data = parseJsonPath(bytes, p.original)
      if (slurp) data = Array.isArray(data) ? data : [data]
      const result = await jqEval(data, expression.trim())
      outputs.push(formatJqOutput(result, raw, compact, spread))
    }
    const out: ByteSource = concatBytes(outputs)
    return [out, new IOResult()]
  }

  const bytes = await readStdinAsync(opts.stdin)
  if (bytes === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('jq: missing input\n') })]
  }
  let data = parseJsonAuto(bytes)
  if (slurp && !Array.isArray(data)) data = [data]
  const result = await jqEval(data, expression.trim())
  return [formatJqOutput(result, raw, compact, spread), new IOResult()]
}

export const TRELLO_JQ = command({
  name: 'jq',
  resource: ResourceName.TRELLO,
  spec: specOf('jq'),
  fn: jqCommand,
})
