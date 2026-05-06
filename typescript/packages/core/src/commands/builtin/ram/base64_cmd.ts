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

import { stream as ramStream } from '../../../core/ram/stream.ts'
import type { RAMAccessor } from '../../../accessor/ram.ts'
import { IOResult, materialize } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { decodeBase64, encodeBase64 } from '../../../utils/base64.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { resolveSource } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

async function* base64EncodeStream(
  source: AsyncIterable<Uint8Array>,
  wrap: number | null,
): AsyncIterable<Uint8Array> {
  const buf = await materialize(source)
  const encoded = encodeBase64(buf)
  if (wrap !== null && wrap === 0) {
    yield ENC.encode(encoded + '\n')
    return
  }
  const lineLen = wrap ?? 76
  const lines: string[] = []
  for (let i = 0; i < encoded.length; i += lineLen) {
    lines.push(encoded.slice(i, i + lineLen))
  }
  yield ENC.encode(lines.join('\n') + '\n')
}

async function* base64DecodeStream(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  const buf = await materialize(source)
  const text = DEC.decode(buf).replace(/[\r\n ]/g, '')
  yield decodeBase64(text)
}

// eslint-disable-next-line @typescript-eslint/require-await
async function base64Command(
  accessor: RAMAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const decode = opts.flags.d === true || opts.flags.D === true
  const wrap = typeof opts.flags.w === 'string' ? Number.parseInt(opts.flags.w, 10) : null
  const cache: string[] = []
  let source: AsyncIterable<Uint8Array>
  if (paths.length > 0) {
    const first = paths[0]
    if (first === undefined) return [null, new IOResult()]
    source = ramStream(accessor, first)
    cache.push(first.original)
  } else {
    try {
      source = resolveSource(opts.stdin, 'base64: missing input')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
    }
  }
  const out = decode ? base64DecodeStream(source) : base64EncodeStream(source, wrap)
  return [out, new IOResult({ cache })]
}

export const RAM_BASE64 = command({
  name: 'base64',
  resource: ResourceName.RAM,
  spec: specOf('base64'),
  fn: base64Command,
})
