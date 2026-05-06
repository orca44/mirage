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
import type { IndexCacheStore } from '../../../cache/index/store.ts'
import { read as githubRead } from '../../../core/github/read.ts'
import { resolveGlob } from '../../../core/github/glob.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { edScript, unifiedDiff } from '../diff_helper.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

interface DiffFlags {
  i: boolean
  w: boolean
  b: boolean
  e: boolean
  q: boolean
}

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

async function diffPair(
  accessor: GitHubAccessor,
  path1: PathSpec,
  path2: PathSpec,
  flags: DiffFlags,
  index: IndexCacheStore | undefined,
): Promise<Uint8Array> {
  const dataA = await githubRead(accessor, path1, index)
  const dataB = await githubRead(accessor, path2, index)
  let textA = DEC.decode(dataA)
  let textB = DEC.decode(dataB)
  if (flags.i) {
    textA = textA.toLowerCase()
    textB = textB.toLowerCase()
  }
  if (flags.w) {
    textA = textA.replace(/\s+/g, '')
    textB = textB.replace(/\s+/g, '')
  } else if (flags.b) {
    textA = textA.replace(/[ \t]+/g, ' ')
    textB = textB.replace(/[ \t]+/g, ' ')
  }
  if (flags.q) {
    if (textA !== textB) return ENC.encode(`Files ${path1.original} and ${path2.original} differ\n`)
    return new Uint8Array(0)
  }
  const aLines = splitLinesKeepEnds(textA)
  const bLines = splitLinesKeepEnds(textB)
  const result = flags.e
    ? edScript(aLines, bLines)
    : unifiedDiff(aLines, bLines, path1.original, path2.original)
  return ENC.encode(result.join(''))
}

async function diffCommand(
  accessor: GitHubAccessor,
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
      new Uint8Array(0),
      new IOResult({ exitCode: 1, stderr: ENC.encode('diff: -r not supported for this resource') }),
    ]
  }
  const flags: DiffFlags = {
    i: opts.flags.i === true,
    w: opts.flags.w === true,
    b: opts.flags.b === true,
    e: opts.flags.e === true,
    q: opts.flags.q === true,
  }
  const p0 = resolved[0]
  const p1 = resolved[1]
  if (p0 === undefined || p1 === undefined) return [null, new IOResult()]
  const output = await diffPair(accessor, p0, p1, flags, opts.index ?? undefined)
  const exitCode = output.byteLength > 0 ? 1 : 0
  const out: ByteSource = output
  return [out, new IOResult({ exitCode, cache: [p0.original, p1.original] })]
}

export const GITHUB_DIFF = command({
  name: 'diff',
  resource: ResourceName.GITHUB,
  spec: specOf('diff'),
  fn: diffCommand,
})
