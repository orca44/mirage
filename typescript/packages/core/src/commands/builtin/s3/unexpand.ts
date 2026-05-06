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

function splitLinesKeepEnds(text: string): string[] {
  const lines: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lines.push(text.slice(start, i + 1))
      start = i + 1
    }
  }
  if (start < text.length) lines.push(text.slice(start))
  return lines
}

function unexpandLine(line: string, tabsize: number, allSpaces: boolean): string {
  if (allSpaces) {
    const result: string[] = []
    let i = 0
    while (i < line.length) {
      let count = 0
      while (i + count < line.length && line[i + count] === ' ') count += 1
      if (count >= tabsize) {
        const tabs = Math.floor(count / tabsize)
        const remainder = count % tabsize
        result.push('\t'.repeat(tabs) + ' '.repeat(remainder))
        i += count
      } else if (count > 0) {
        result.push(' '.repeat(count))
        i += count
      } else {
        result.push(line[i] ?? '')
        i += 1
      }
    }
    return result.join('')
  }
  let leading = 0
  while (leading < line.length && line[leading] === ' ') leading += 1
  if (leading >= tabsize) {
    const tabs = Math.floor(leading / tabsize)
    const remainder = leading % tabsize
    return '\t'.repeat(tabs) + ' '.repeat(remainder) + line.slice(leading)
  }
  return line
}

async function unexpandCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const tabsize = typeof opts.flags.t === 'string' ? Number.parseInt(opts.flags.t, 10) : 8
  const allSpaces = opts.flags.a === true
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const parts: string[] = []
    for (const p of resolved) {
      const data = DEC.decode(await s3Read(accessor, p, opts.index ?? undefined))
      for (const ln of splitLinesKeepEnds(data)) parts.push(unexpandLine(ln, tabsize, allSpaces))
    }
    const result: ByteSource = ENC.encode(parts.join(''))
    return [result, new IOResult()]
  }
  const stdinData = await readStdinAsync(opts.stdin)
  if (stdinData === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('unexpand: missing operand\n') })]
  }
  const text = DEC.decode(stdinData)
  const lines = splitLinesKeepEnds(text)
  const result: ByteSource = ENC.encode(
    lines.map((ln) => unexpandLine(ln, tabsize, allSpaces)).join(''),
  )
  return [result, new IOResult()]
}

export const S3_UNEXPAND = command({
  name: 'unexpand',
  resource: ResourceName.S3,
  spec: specOf('unexpand'),
  fn: unexpandCommand,
})
