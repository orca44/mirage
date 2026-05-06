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
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import type { DiskAccessor } from '../../../accessor/disk.ts'
import { stream as diskStream } from '../../../core/disk/stream.ts'
import { metadata, transcribe } from '../utils.ts'

const ENC = new TextEncoder()

async function tailWavCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tail: missing operand\n') })]
  }
  const first = paths[0]
  if (first === undefined) return [null, new IOResult()]
  if (typeof opts.flags.c === 'string') {
    return [
      null,
      new IOResult({ exitCode: 1, stderr: ENC.encode('tail: -c not supported for audio files\n') }),
    ]
  }
  const n = typeof opts.flags.n === 'string' ? Number.parseInt(opts.flags.n, 10) : 10
  try {
    const raw = await materialize(diskStream(accessor, first))
    const meta = await metadata(raw)
    const duration = meta.duration ?? 0
    const start = Math.max(0, duration - n)
    const out: ByteSource = transcribe(raw, start)
    return [out, new IOResult({ reads: { [first.original]: raw }, cache: [first.original] })]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode(`tail: ${first.original}: failed to read as wav: ${msg}\n`),
      }),
    ]
  }
}

export const DISK_LOCAL_AUDIO_TAIL_WAV = command({
  name: 'tail',
  resource: ResourceName.DISK,
  spec: specOf('tail'),
  filetype: '.wav',
  fn: tailWavCommand,
})
