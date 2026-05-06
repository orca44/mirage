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

import type { GDriveAccessor } from '../../../accessor/gdrive.ts'
import { resolveGlob } from '../../../core/gdrive/glob.ts'
import { read as gdriveRead } from '../../../core/gdrive/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { edScript, unifiedDiff } from '../diff_helper.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function splitWithEol(text: string): string[] {
  const lines: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === '\n') {
      lines.push(text.slice(start, i + 1))
      start = i + 1
    }
  }
  if (start < text.length) lines.push(text.slice(start))
  return lines
}

async function diffCommand(
  accessor: GDriveAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length < 2) {
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode('diff: requires two paths\n') })]
  }
  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
  if (opts.flags.r === true) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode('diff: -r not supported for this resource\n'),
      }),
    ]
  }
  const p0 = resolved[0]
  const p1 = resolved[1]
  if (p0 === undefined || p1 === undefined) return [null, new IOResult()]
  const dataA = await gdriveRead(accessor, p0, opts.index ?? undefined)
  const dataB = await gdriveRead(accessor, p1, opts.index ?? undefined)
  let textA = DEC.decode(dataA)
  let textB = DEC.decode(dataB)
  if (opts.flags.i === true) {
    textA = textA.toLowerCase()
    textB = textB.toLowerCase()
  }
  if (opts.flags.w === true) {
    textA = textA.replace(/\s+/g, '')
    textB = textB.replace(/\s+/g, '')
  } else if (opts.flags.b === true) {
    textA = textA.replace(/[ \t]+/g, ' ')
    textB = textB.replace(/[ \t]+/g, ' ')
  }
  if (opts.flags.q === true) {
    const equal = textA === textB
    if (equal) return [null, new IOResult()]
    const out: ByteSource = ENC.encode(`Files ${p0.original} and ${p1.original} differ\n`)
    return [out, new IOResult({ exitCode: 1 })]
  }
  const aLines = splitWithEol(textA)
  const bLines = splitWithEol(textB)
  const result =
    opts.flags.e === true
      ? edScript(aLines, bLines)
      : unifiedDiff(aLines, bLines, p0.original, p1.original)
  const output = result.join('')
  const out: ByteSource = ENC.encode(output)
  return [out, new IOResult({ exitCode: output !== '' ? 1 : 0 })]
}

export const GDRIVE_DIFF = command({
  name: 'diff',
  resource: ResourceName.GDRIVE,
  spec: specOf('diff'),
  fn: diffCommand,
})
