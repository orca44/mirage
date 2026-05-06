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

import {
  IOResult,
  ResourceName,
  command,
  edScript,
  materialize,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
  unifiedDiff,
} from '@struktoai/mirage-core'
import { stream as redisStream } from '../../../core/redis/stream.ts'
import type { RedisAccessor } from '../../../accessor/redis.ts'

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

async function readFile(accessor: RedisAccessor, p: PathSpec): Promise<Uint8Array> {
  return materialize(redisStream(accessor, p))
}

async function diffPair(
  accessor: RedisAccessor,
  path1: PathSpec,
  path2: PathSpec,
  flags: DiffFlags,
): Promise<Uint8Array> {
  const dataA = await readFile(accessor, path1)
  const dataB = await readFile(accessor, path2)
  let textA = DEC.decode(dataA)
  let textB = DEC.decode(dataB)
  if (flags.i) {
    textA = textA.toLowerCase()
    textB = textB.toLowerCase()
  }
  if (flags.w) {
    textA = textA.replace(/\s+/g, '')
    textB = textB.replace(/\s+/g, '')
  }
  if (flags.b) {
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
  accessor: RedisAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length < 2) {
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode('diff: requires two paths\n') })]
  }
  const flags: DiffFlags = {
    i: opts.flags.i === true,
    w: opts.flags.w === true,
    b: opts.flags.b === true,
    e: opts.flags.e === true,
    q: opts.flags.q === true,
  }
  const p0 = paths[0]
  const p1 = paths[1]
  if (p0 === undefined || p1 === undefined) return [null, new IOResult()]
  const output = await diffPair(accessor, p0, p1, flags)
  const exitCode = output.byteLength > 0 ? 1 : 0
  const out: ByteSource = output
  return [out, new IOResult({ exitCode, cache: [p0.stripPrefix, p1.stripPrefix] })]
}

export const REDIS_DIFF = command({
  name: 'diff',
  resource: ResourceName.REDIS,
  spec: specOf('diff'),
  fn: diffCommand,
})
