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
  type RAMAccessor,
} from '@struktoai/mirage-core'
import { transcribe } from '../utils.ts'
import { readRam } from './read.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder()

async function grepOggCommand(
  accessor: RAMAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0 || texts.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('grep: missing operand\n') })]
  }
  const first = paths[0]
  if (first === undefined) return [null, new IOResult()]
  const pattern = texts[0] ?? ''
  const ignoreCase = opts.flags.i === true
  try {
    const raw = readRam(accessor, first)
    const text = DEC.decode(await materialize(transcribe(raw)))
    const flags = ignoreCase ? 'i' : ''
    const re = new RegExp(pattern, flags)
    if (re.test(text)) {
      const out: ByteSource = ENC.encode(text)
      return [out, new IOResult({ reads: { [first.original]: raw }, cache: [first.original] })]
    }
    return [
      null,
      new IOResult({
        exitCode: 1,
        reads: { [first.original]: raw },
        cache: [first.original],
      }),
    ]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode(`grep: ${first.original}: failed to read as ogg: ${msg}\n`),
      }),
    ]
  }
}

export const RAM_LOCAL_AUDIO_GREP_OGG = command({
  name: 'grep',
  resource: ResourceName.RAM,
  spec: specOf('grep'),
  filetype: '.ogg',
  fn: grepOggCommand,
})
