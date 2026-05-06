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

import type { BoxAccessor } from '../../../accessor/box.ts'
import {
  concatBytes,
  formatJqOutput,
  jqEval,
  parseJsonAuto,
  parseJsonPath,
} from '../../../core/jq/index.ts'
import { resolveGlob } from '../../../core/box/glob.ts'
import { read as boxRead } from '../../../core/box/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()

async function jqCommand(
  accessor: BoxAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (texts.length === 0 || texts[0] === undefined) {
    return [
      null,
      new IOResult({ exitCode: 2, stderr: ENC.encode('jq: usage: jq EXPRESSION [path]\n') }),
    ]
  }
  const expression = texts[0]
  const r = opts.flags.r === true
  const c = opts.flags.c === true
  const s = opts.flags.s === true
  const spread = expression.includes('[]')
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const parts: Uint8Array[] = []
    for (const p of resolved) {
      const raw = await boxRead(accessor, p, opts.index ?? undefined)
      let data = parseJsonPath(raw, p.original)
      if (s) data = Array.isArray(data) ? data : [data]
      const result = await jqEval(data, expression.trim())
      parts.push(formatJqOutput(result, r, c, spread))
    }
    const out: ByteSource = concatBytes(parts)
    return [out, new IOResult()]
  }
  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode('jq: missing input\n') })]
  }
  let data = parseJsonAuto(raw)
  if (s && !Array.isArray(data)) data = [data]
  const result = await jqEval(data, expression.trim())
  const out: ByteSource = formatJqOutput(result, r, c, spread)
  return [out, new IOResult()]
}

export const BOX_JQ = command({
  name: 'jq',
  resource: ResourceName.BOX,
  spec: specOf('jq'),
  fn: jqCommand,
})
