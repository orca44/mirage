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

import type { GitHubAccessor } from '../../../accessor/github.ts'
import { resolveGlob } from '../../../core/github/glob.ts'
import { stream as githubStream } from '../../../core/github/read.ts'
import { AsyncLineIterator } from '../../../io/async_line_iterator.ts'
import { IOResult } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { resolveSource } from '../utils/stream.ts'
import { headTailProvision } from './provision.ts'

const ENC = new TextEncoder()

async function* headStream(
  source: AsyncIterable<Uint8Array>,
  lines: number,
  bytesMode: number | null,
): AsyncIterable<Uint8Array> {
  if (bytesMode !== null) {
    let remaining = bytesMode
    for await (const chunk of source) {
      if (chunk.byteLength <= remaining) {
        yield chunk
        remaining -= chunk.byteLength
        if (remaining <= 0) return
      } else {
        yield chunk.slice(0, remaining)
        return
      }
    }
    return
  }
  let count = 0
  const lineIter = new AsyncLineIterator(source)
  for await (const line of lineIter) {
    const out = new Uint8Array(line.byteLength + 1)
    out.set(line, 0)
    out[line.byteLength] = 0x0a
    yield out
    count += 1
    if (count >= lines) return
  }
}

async function headCommand(
  accessor: GitHubAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nRaw = typeof opts.flags.n === 'string' ? opts.flags.n : null
  const cRaw = typeof opts.flags.c === 'string' ? opts.flags.c : null
  const lines = nRaw !== null ? Number.parseInt(nRaw, 10) : 10
  const bytesMode = cRaw !== null ? Number.parseInt(cRaw, 10) : null
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    const source = githubStream(accessor, first, opts.index ?? undefined)
    return [headStream(source, lines, bytesMode), new IOResult()]
  }
  try {
    const source = resolveSource(opts.stdin, 'head: missing operand')
    return [headStream(source, lines, bytesMode), new IOResult()]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
  }
}

export const GITHUB_HEAD = command({
  name: 'head',
  resource: ResourceName.GITHUB,
  spec: specOf('head'),
  fn: headCommand,
  provision: headTailProvision,
})
