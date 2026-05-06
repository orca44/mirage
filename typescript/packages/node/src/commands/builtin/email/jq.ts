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
  jqEval,
  parseJsonAuto,
  parseJsonPath,
  readStdinAsync,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import type { EmailAccessor } from '../../../accessor/email.ts'
import { resolveGlob } from '../../../core/email/glob.ts'
import { read as emailRead } from '../../../core/email/read.ts'

const ENC = new TextEncoder()

function formatResult(result: unknown, raw: boolean, compact: boolean): Uint8Array {
  if (raw && typeof result === 'string') return ENC.encode(result + '\n')
  const json = compact ? JSON.stringify(result) : JSON.stringify(result, null, 2)
  return ENC.encode(json + '\n')
}

function formatResults(
  results: unknown,
  raw: boolean,
  compact: boolean,
  spread: boolean,
): Uint8Array {
  if (spread && Array.isArray(results)) {
    const parts: Uint8Array[] = []
    for (const item of results) parts.push(formatResult(item, raw, compact))
    let total = 0
    for (const p of parts) total += p.byteLength
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of parts) {
      out.set(p, offset)
      offset += p.byteLength
    }
    return out
  }
  return formatResult(results, raw, compact)
}

async function jqCommand(
  accessor: EmailAccessor,
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
      const raw = await emailRead(accessor, p, opts.index ?? undefined)
      let data = parseJsonPath(raw, p.original)
      if (s) data = Array.isArray(data) ? data : [data]
      const result = await jqEval(data, expression.trim())
      parts.push(formatResults(result, r, c, spread))
    }
    let total = 0
    for (const part of parts) total += part.byteLength
    const out = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
      out.set(part, offset)
      offset += part.byteLength
    }
    const result: ByteSource = out
    return [result, new IOResult()]
  }
  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode('jq: missing input\n') })]
  }
  let data = parseJsonAuto(raw)
  if (s && !Array.isArray(data)) data = [data]
  const result = await jqEval(data, expression.trim())
  const out: ByteSource = formatResults(result, r, c, spread)
  return [out, new IOResult()]
}

export const EMAIL_JQ = command({
  name: 'jq',
  resource: ResourceName.EMAIL,
  spec: specOf('jq'),
  fn: jqCommand,
})
