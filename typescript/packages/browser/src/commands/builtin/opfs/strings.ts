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
  materialize,
  readStdinAsync,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as opfsStream } from '../../../core/opfs/stream.ts'
import type { OPFSAccessor } from '../../../accessor/opfs.ts'

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
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const minLen = typeof opts.flags.n === 'string' ? Number.parseInt(opts.flags.n, 10) : 4
  let raw: Uint8Array
  if (paths.length > 0) {
    const first = paths[0]
    if (first === undefined) return [null, new IOResult()]
    raw = await materialize(opfsStream(accessor.rootHandle, first))
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

export const OPFS_STRINGS = command({
  name: 'strings',
  resource: ResourceName.OPFS,
  spec: specOf('strings'),
  fn: stringsCommand,
})
