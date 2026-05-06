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

import type { GitHubCIAccessor } from '../../../accessor/github_ci.ts'
import { resolveGlob } from '../../../core/github_ci/glob.ts'
import { read as ciRead } from '../../../core/github_ci/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'
import { fileReadProvision } from './provision.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function countChar(text: string, ch: string): number {
  let n = 0
  for (const c of text) if (c === ch) n += 1
  return n
}

function maxLineLength(text: string): number {
  let max = 0
  for (const ln of text.split('\n')) if (ln.length > max) max = ln.length
  return max
}

async function wcCommand(
  accessor: GitHubCIAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const f = opts.flags
  const lFlag = f.args_l === true
  const wFlag = f.w === true
  const cFlag = f.c === true
  const mFlag = f.m === true
  const LFlag = f.L === true
  let data: Uint8Array
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    data = await ciRead(accessor, first, opts.index ?? undefined)
  } else {
    const raw = await readStdinAsync(opts.stdin)
    if (raw === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('wc: missing operand\n') })]
    }
    data = raw
  }
  const text = DEC.decode(data)
  const lineCount = countChar(text, '\n')
  const wordCount = text.split(/\s+/).filter((s) => s !== '').length
  const byteCount = data.byteLength
  if (LFlag) return [ENC.encode(String(maxLineLength(text))), new IOResult()]
  if (lFlag) return [ENC.encode(String(lineCount)), new IOResult()]
  if (wFlag) return [ENC.encode(String(wordCount)), new IOResult()]
  if (mFlag) return [ENC.encode(String(text.length)), new IOResult()]
  if (cFlag) return [ENC.encode(String(byteCount)), new IOResult()]
  const out: ByteSource = ENC.encode(
    `${String(lineCount)}\t${String(wordCount)}\t${String(byteCount)}`,
  )
  return [out, new IOResult()]
}

export const GITHUB_CI_WC = command({
  name: 'wc',
  resource: ResourceName.GITHUB_CI,
  spec: specOf('wc'),
  fn: wcCommand,
  provision: fileReadProvision,
})
