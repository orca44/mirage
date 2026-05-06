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
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
  type RAMAccessor,
} from '@struktoai/mirage-core'
import { transcribe } from '../utils.ts'
import { readRam } from './read.ts'

const ENC = new TextEncoder()

function catWavCommand(
  accessor: RAMAccessor,
  paths: PathSpec[],
  _texts: string[],
  _opts: CommandOpts,
): CommandFnResult {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('cat: missing operand\n') })]
  }
  const first = paths[0]
  if (first === undefined) return [null, new IOResult()]
  try {
    const raw = readRam(accessor, first)
    const out: ByteSource = transcribe(raw)
    return [out, new IOResult({ reads: { [first.original]: raw }, cache: [first.original] })]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode(`cat: ${first.original}: failed to read as wav: ${msg}\n`),
      }),
    ]
  }
}

export const RAM_LOCAL_AUDIO_CAT_WAV = command({
  name: 'cat',
  resource: ResourceName.RAM,
  spec: specOf('cat'),
  filetype: '.wav',
  fn: catWavCommand,
})
