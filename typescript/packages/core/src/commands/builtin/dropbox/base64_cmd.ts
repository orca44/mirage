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
import { read as dropboxRead } from '../../../core/dropbox/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { decodeBase64, encodeBase64 } from '../../../utils/base64.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

async function base64Command(
  accessor: DropboxAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  let raw: Uint8Array | null = null
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    raw = await dropboxRead(accessor, first, opts.index ?? undefined)
  } else {
    raw = await readStdinAsync(opts.stdin)
    if (raw === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('base64: missing input\n') })]
    }
  }
  const decode = opts.flags.d === true || opts.flags.D === true
  if (decode) {
    const text = DEC.decode(raw).replace(/[\r\n ]/g, '')
    const out: ByteSource = decodeBase64(text)
    return [out, new IOResult()]
  }
  const encoded = encodeBase64(raw)
  const wrap = typeof opts.flags.w === 'string' ? Number.parseInt(opts.flags.w, 10) : null
  if (wrap !== null && wrap === 0) {
    return [ENC.encode(encoded + '\n'), new IOResult()]
  }
  const lineLen = wrap ?? 76
  const lines: string[] = []
  for (let i = 0; i < encoded.length; i += lineLen) {
    lines.push(encoded.slice(i, i + lineLen))
  }
  const out: ByteSource = ENC.encode(lines.join('\n') + '\n')
  return [out, new IOResult()]
}

export const DROPBOX_BASE64 = command({
  name: 'base64',
  resource: ResourceName.DROPBOX,
  spec: specOf('base64'),
  fn: base64Command,
})
