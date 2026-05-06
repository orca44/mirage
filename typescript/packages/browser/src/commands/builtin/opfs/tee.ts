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
import { writeBytes as opfsWrite } from '../../../core/opfs/write.ts'
import { stream as opfsStream } from '../../../core/opfs/stream.ts'
import type { OPFSAccessor } from '../../../accessor/opfs.ts'

const ENC = new TextEncoder()

async function teeCommand(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tee: missing operand\n') })]
  }
  const first = paths[0]
  if (first === undefined) return [null, new IOResult()]
  const stdinData = await readStdinAsync(opts.stdin)
  const raw: Uint8Array = stdinData ?? ENC.encode(texts.join(' '))
  let writeData = raw
  if (opts.flags.a === true) {
    try {
      const existing = await materialize(opfsStream(accessor.rootHandle, first))
      writeData = new Uint8Array(existing.byteLength + raw.byteLength)
      writeData.set(existing, 0)
      writeData.set(raw, existing.byteLength)
    } catch (err) {
      if (!(err instanceof Error) || !/not found/i.test(err.message)) throw err
    }
  }
  await opfsWrite(accessor.rootHandle, first, writeData)
  const out: ByteSource = raw
  return [
    out,
    new IOResult({
      writes: { [first.stripPrefix]: writeData },
      cache: [first.stripPrefix],
    }),
  ]
}

export const OPFS_TEE = command({
  name: 'tee',
  resource: ResourceName.OPFS,
  spec: specOf('tee'),
  fn: teeCommand,
  write: true,
})
