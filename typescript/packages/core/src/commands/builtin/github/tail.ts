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
import { read as githubRead } from '../../../core/github/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { countNewlines, parseN, tailBytes } from '../tail_helper.ts'
import { readStdinAsync } from '../utils/stream.ts'
import { headTailProvision } from './provision.ts'

const ENC = new TextEncoder()

async function tailCommand(
  accessor: GitHubAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nRaw = typeof opts.flags.n === 'string' ? opts.flags.n : null
  const cRaw = typeof opts.flags.c === 'string' ? opts.flags.c : null
  const [lines, plusMode] = parseN(nRaw)
  const bytesMode = cRaw !== null ? Number.parseInt(cRaw, 10) : null
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    const raw = await githubRead(accessor, first, opts.index ?? undefined)
    let result: Uint8Array
    let shouldCache: boolean
    if (bytesMode !== null) {
      result = bytesMode === 0 ? new Uint8Array(0) : raw.slice(-bytesMode)
      shouldCache = bytesMode >= raw.byteLength
    } else {
      result = tailBytes(raw, lines, null, plusMode)
      shouldCache = !plusMode && lines >= countNewlines(raw)
    }
    const cache: string[] = shouldCache ? [first.original] : []
    const out: ByteSource = result
    return [out, new IOResult({ cache })]
  }
  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tail: missing operand\n') })]
  }
  if (bytesMode !== null) {
    const out: ByteSource = bytesMode === 0 ? new Uint8Array(0) : raw.slice(-bytesMode)
    return [out, new IOResult()]
  }
  return [tailBytes(raw, lines, null, plusMode), new IOResult()]
}

export const GITHUB_TAIL = command({
  name: 'tail',
  resource: ResourceName.GITHUB,
  spec: specOf('tail'),
  fn: tailCommand,
  provision: headTailProvision,
})
