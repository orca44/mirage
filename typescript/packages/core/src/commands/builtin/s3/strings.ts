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

import type { S3Accessor } from '../../../accessor/s3.ts'
import { resolveGlob } from '../../../core/s3/glob.ts'
import { read as s3Read } from '../../../core/s3/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()

function extractStrings(data: Uint8Array, minLen: number): string[] {
  const out: string[] = []
  let current: number[] = []
  for (let i = 0; i < data.byteLength; i++) {
    const b = data[i] ?? 0
    if (b >= 0x20 && b <= 0x7e) {
      current.push(b)
    } else {
      if (current.length >= minLen) {
        out.push(String.fromCharCode(...current))
      }
      current = []
    }
  }
  if (current.length >= minLen) {
    out.push(String.fromCharCode(...current))
  }
  return out
}

async function stringsCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const minLen = typeof opts.flags.n === 'string' ? Number.parseInt(opts.flags.n, 10) : 4
  let raw: Uint8Array
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    raw = await s3Read(accessor, first, opts.index ?? undefined)
  } else {
    const stdinData = await readStdinAsync(opts.stdin)
    if (stdinData === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('strings: missing input\n') })]
    }
    raw = stdinData
  }
  const matches = extractStrings(raw, minLen)
  const output = matches.length > 0 ? matches.join('\n') + '\n' : ''
  const result: ByteSource = ENC.encode(output)
  return [result, new IOResult()]
}

export const S3_STRINGS = command({
  name: 'strings',
  resource: ResourceName.S3,
  spec: specOf('strings'),
  fn: stringsCommand,
})
