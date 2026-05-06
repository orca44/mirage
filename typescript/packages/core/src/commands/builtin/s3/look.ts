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
import { read as s3Read } from '../../../core/s3/read.ts'
import { resolveGlob } from '../../../core/s3/glob.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function splitLinesNoTrailing(text: string): string[] {
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text
  return stripped === '' ? [] : stripped.split('\n')
}

async function lookCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (texts.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('look: missing prefix\n') })]
  }
  const prefix = texts[0] ?? ''
  const caseInsensitive = opts.flags.f === true
  let raw: Uint8Array
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    raw = await s3Read(accessor, first)
  } else {
    const stdinData = await readStdinAsync(opts.stdin)
    if (stdinData === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('look: missing input\n') })]
    }
    raw = stdinData
  }
  const lines = splitLinesNoTrailing(DEC.decode(raw))
  const cmpPrefix = caseInsensitive ? prefix.toLowerCase() : prefix
  const matched: string[] = []
  for (const line of lines) {
    const cmpLine = caseInsensitive ? line.toLowerCase() : line
    if (cmpLine.startsWith(cmpPrefix)) matched.push(line)
  }
  if (matched.length === 0) return [null, new IOResult({ exitCode: 1 })]
  const result: ByteSource = ENC.encode(matched.join('\n') + '\n')
  return [result, new IOResult()]
}

export const S3_LOOK = command({
  name: 'look',
  resource: ResourceName.S3,
  spec: specOf('look'),
  fn: lookCommand,
})
