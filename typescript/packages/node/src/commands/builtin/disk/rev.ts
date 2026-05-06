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
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as diskStream } from '../../../core/disk/stream.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function reverseString(s: string): string {
  return Array.from(s).reverse().join('')
}

async function* revStream(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  const iter = new AsyncLineIterator(source)
  for await (const line of iter) {
    yield ENC.encode(reverseString(DEC.decode(line)) + '\n')
  }
}

async function* revMulti(
  accessor: DiskAccessor,
  paths: readonly PathSpec[],
): AsyncIterable<Uint8Array> {
  for (const p of paths) {
    for await (const chunk of revStream(diskStream(accessor, p))) yield chunk
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
async function revCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length > 0) {
    return [revMulti(accessor, paths), new IOResult()]
  }
  try {
    const source = resolveSource(opts.stdin, 'rev: missing operand')
    return [revStream(source), new IOResult()]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
  }
}

export const DISK_REV = command({
  name: 'rev',
  resource: ResourceName.DISK,
  spec: specOf('rev'),
  fn: revCommand,
})
