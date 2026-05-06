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
const DEC = new TextDecoder('utf-8', { fatal: false })

function splitLinesNoTrailing(text: string): string[] {
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text
  return stripped === '' ? [] : stripped.split('\n')
}

function foldLine(line: string, width: number, breakSpaces: boolean): string {
  if (line.length <= width) return line
  const parts: string[] = []
  let rest = line
  while (rest.length > width) {
    if (breakSpaces) {
      const idx = rest.lastIndexOf(' ', width - 1)
      if (idx > 0) {
        parts.push(rest.slice(0, idx + 1))
        rest = rest.slice(idx + 1)
      } else {
        parts.push(rest.slice(0, width))
        rest = rest.slice(width)
      }
    } else {
      parts.push(rest.slice(0, width))
      rest = rest.slice(width)
    }
  }
  if (rest !== '') parts.push(rest)
  return parts.join('\n')
}

async function foldCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const width = typeof opts.flags.w === 'string' ? Number.parseInt(opts.flags.w, 10) : 80
  const breakSpaces = opts.flags.s === true
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const allLines: string[] = []
    for (const p of resolved) {
      const data = DEC.decode(await s3Read(accessor, p, opts.index ?? undefined))
      for (const line of splitLinesNoTrailing(data)) {
        allLines.push(foldLine(line, width, breakSpaces))
      }
    }
    const result: ByteSource = ENC.encode(allLines.join('\n') + '\n')
    return [result, new IOResult()]
  }
  const stdinData = await readStdinAsync(opts.stdin)
  if (stdinData === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('fold: missing operand\n') })]
  }
  const lines = splitLinesNoTrailing(DEC.decode(stdinData))
  const result: ByteSource = ENC.encode(
    lines.map((ln) => foldLine(ln, width, breakSpaces)).join('\n') + '\n',
  )
  return [result, new IOResult()]
}

export const S3_FOLD = command({
  name: 'fold',
  resource: ResourceName.S3,
  spec: specOf('fold'),
  fn: foldCommand,
})
