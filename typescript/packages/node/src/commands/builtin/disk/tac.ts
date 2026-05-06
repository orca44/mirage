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
  AsyncLineIterator,
  IOResult,
  ResourceName,
  command,
  resolveSource,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as diskStream } from '../../../core/disk/stream.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

const ENC = new TextEncoder()

async function collectLines(source: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const lines: Uint8Array[] = []
  const iter = new AsyncLineIterator(source)
  for await (const line of iter) lines.push(line)
  return lines
}

async function tacCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const cache: string[] = []
  let source: AsyncIterable<Uint8Array>
  if (paths.length > 0) {
    const first = paths[0]
    if (first === undefined) return [null, new IOResult()]
    source = diskStream(accessor, first)
    cache.push(first.original)
  } else {
    try {
      source = resolveSource(opts.stdin, 'tac: missing input')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
    }
  }
  const lines = await collectLines(source)
  lines.reverse()
  let total = 0
  for (const l of lines) total += l.byteLength + 1
  const out = new Uint8Array(total)
  let offset = 0
  for (const l of lines) {
    out.set(l, offset)
    offset += l.byteLength
    out[offset] = 0x0a
    offset += 1
  }
  const result: ByteSource = out
  return [result, new IOResult({ cache })]
}

export const DISK_TAC = command({
  name: 'tac',
  resource: ResourceName.DISK,
  spec: specOf('tac'),
  fn: tacCommand,
})
