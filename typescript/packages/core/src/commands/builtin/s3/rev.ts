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

function reverseString(s: string): string {
  return Array.from(s).reverse().join('')
}

async function revCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const allLines: string[] = []
    for (const p of resolved) {
      const data = DEC.decode(await s3Read(accessor, p, opts.index ?? undefined))
      for (const line of data.split('\n')) {
        // Python's splitlines drops a single trailing empty line.
        allLines.push(line)
      }
      // Match Python splitlines(): drop trailing empty if data ended with \n
      if (data.endsWith('\n') && allLines[allLines.length - 1] === '') {
        allLines.pop()
      }
    }
    const reversedLines = allLines.map(reverseString)
    const out: ByteSource = ENC.encode(reversedLines.join('\n') + '\n')
    return [out, new IOResult()]
  }
  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('rev: missing operand\n') })]
  }
  const text = DEC.decode(raw)
  const lines = text.split('\n')
  if (text.endsWith('\n') && lines[lines.length - 1] === '') {
    lines.pop()
  }
  const reversedLines = lines.map(reverseString)
  const out: ByteSource = ENC.encode(reversedLines.join('\n') + '\n')
  return [out, new IOResult()]
}

export const S3_REV = command({
  name: 'rev',
  resource: ResourceName.S3,
  spec: specOf('rev'),
  fn: revCommand,
})
