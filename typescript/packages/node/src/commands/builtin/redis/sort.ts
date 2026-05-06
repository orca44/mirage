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
  compareKeys,
  materialize,
  readStdinAsync,
  sortKey,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
  type SortKeyOptions,
} from '@struktoai/mirage-core'
import { stream as redisStream } from '../../../core/redis/stream.ts'
import type { RedisAccessor } from '../../../accessor/redis.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function parseKeyOptions(flags: Record<string, string | boolean>): SortKeyOptions {
  return {
    keyField: typeof flags.k === 'string' ? Number.parseInt(flags.k, 10) : null,
    fieldSep: typeof flags.t === 'string' ? flags.t : null,
    ignoreCase: flags.f === true,
    numeric: flags.n === true,
    humanNumeric: flags.h === true,
    version: flags.V === true,
    month: flags.M === true,
  }
}

function sortAndDedupe(
  lines: string[],
  opts: SortKeyOptions,
  reverse: boolean,
  unique: boolean,
): string[] {
  const keyed = lines.map((l) => ({ l, k: sortKey(l, opts) }))
  keyed.sort((a, b) => compareKeys(a.k, b.k))
  let sorted = keyed.map((x) => x.l)
  if (reverse) sorted.reverse()
  if (unique) {
    const seen = new Set<string>()
    sorted = sorted.filter((l) => {
      if (seen.has(l)) return false
      seen.add(l)
      return true
    })
  }
  return sorted
}

function splitLinesNoEnds(text: string): string[] {
  if (text === '') return []
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text
  return stripped.split('\n')
}

async function readFile(accessor: RedisAccessor, p: PathSpec): Promise<Uint8Array> {
  return materialize(redisStream(accessor, p))
}

async function sortCommand(
  accessor: RedisAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const keyOpts = parseKeyOptions(opts.flags)
  const reverse = opts.flags.r === true
  const unique = opts.flags.u === true
  let allLines: string[] = []
  if (paths.length > 0) {
    for (const p of paths) {
      const data = DEC.decode(await readFile(accessor, p))
      allLines = allLines.concat(splitLinesNoEnds(data))
    }
  } else {
    const raw = await readStdinAsync(opts.stdin)
    if (raw === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('sort: missing operand\n') })]
    }
    allLines = splitLinesNoEnds(DEC.decode(raw))
  }
  const sorted = sortAndDedupe(allLines, keyOpts, reverse, unique)
  const output = sorted.join('\n')
  const out: ByteSource = output === '' ? new Uint8Array(0) : ENC.encode(output + '\n')
  return [out, new IOResult()]
}

export const REDIS_SORT = command({
  name: 'sort',
  resource: ResourceName.REDIS,
  spec: specOf('sort'),
  fn: sortCommand,
})
