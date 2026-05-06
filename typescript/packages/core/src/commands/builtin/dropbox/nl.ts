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

import type { DropboxAccessor } from '../../../accessor/dropbox.ts'
import { resolveGlob } from '../../../core/dropbox/glob.ts'
import { read as dropboxRead } from '../../../core/dropbox/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function shouldNumber(line: string, mode: string, pattern: RegExp | null): boolean {
  if (mode === 'n') return false
  if (mode === 'a') return true
  if (mode === 'p' && pattern !== null) return pattern.test(line)
  return line.trim() !== ''
}

function pad(n: number, width: number): string {
  const s = String(n)
  return s.length >= width ? s : ' '.repeat(width - s.length) + s
}

async function nlCommand(
  accessor: DropboxAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const bRaw = typeof opts.flags.b === 'string' ? opts.flags.b : 't'
  let mode = bRaw
  let pattern: RegExp | null = null
  if (bRaw.startsWith('p')) {
    mode = 'p'
    pattern = new RegExp(bRaw.slice(1))
  }
  const start = typeof opts.flags.v === 'string' ? Number.parseInt(opts.flags.v, 10) : 1
  const increment = typeof opts.flags.i === 'string' ? Number.parseInt(opts.flags.i, 10) : 1
  const width = typeof opts.flags.w === 'string' ? Number.parseInt(opts.flags.w, 10) : 6
  const separator = typeof opts.flags.s === 'string' ? opts.flags.s : '\t'

  let raw: Uint8Array | null = null
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    raw = await dropboxRead(accessor, first, opts.index ?? undefined)
  } else {
    raw = await readStdinAsync(opts.stdin)
    if (raw === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('nl: missing operand\n') })]
    }
  }

  let num = start
  const outLines: string[] = []
  for (const line of DEC.decode(raw).split('\n')) {
    if (shouldNumber(line, mode, pattern)) {
      outLines.push(`${pad(num, width)}${separator}${line}`)
      num += increment
    } else {
      outLines.push(`${' '.repeat(width)}${separator}${line}`)
    }
  }
  const out: ByteSource = ENC.encode(outLines.join('\n') + '\n')
  return [out, new IOResult()]
}

export const DROPBOX_NL = command({
  name: 'nl',
  resource: ResourceName.DROPBOX,
  spec: specOf('nl'),
  fn: nlCommand,
})
