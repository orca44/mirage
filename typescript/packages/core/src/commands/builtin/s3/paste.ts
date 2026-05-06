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

function splitLinesNoEnds(text: string): string[] {
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text
  return stripped === '' ? [] : stripped.split('\n')
}

async function pasteCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const delimiter = typeof opts.flags.d === 'string' ? opts.flags.d : '\t'
  const serial = opts.flags.s === true
  const resolved =
    paths.length > 0 ? await resolveGlob(accessor, paths, opts.index ?? undefined) : paths
  const fileLines: string[][] = []
  let stdinConsumed = false
  for (const p of resolved) {
    if (p.original === '-') {
      const raw = stdinConsumed ? null : await readStdinAsync(opts.stdin)
      stdinConsumed = true
      fileLines.push(splitLinesNoEnds(raw !== null ? DEC.decode(raw) : ''))
    } else {
      const data = await s3Read(accessor, p)
      fileLines.push(splitLinesNoEnds(DEC.decode(data)))
    }
  }
  if (fileLines.length === 0 && !stdinConsumed) {
    const raw = await readStdinAsync(opts.stdin)
    if (raw !== null) fileLines.push(splitLinesNoEnds(DEC.decode(raw)))
  }
  if (fileLines.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('paste: missing operand\n') })]
  }
  let outLines: string[]
  if (serial) {
    outLines = fileLines.map((lines) => lines.join(delimiter))
  } else {
    const maxLen = Math.max(...fileLines.map((l) => l.length))
    outLines = []
    for (let i = 0; i < maxLen; i++) {
      outLines.push(fileLines.map((lines) => lines[i] ?? '').join(delimiter))
    }
  }
  const out: ByteSource = ENC.encode(outLines.join('\n') + '\n')
  return [out, new IOResult()]
}

export const S3_PASTE = command({
  name: 'paste',
  resource: ResourceName.S3,
  spec: specOf('paste'),
  fn: pasteCommand,
})
