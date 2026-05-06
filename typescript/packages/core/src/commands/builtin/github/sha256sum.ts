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
import { resolveGlob } from '../../../core/github/glob.ts'
import { read as githubRead } from '../../../core/github/read.ts'
import { stream as githubStream } from '../../../core/github/read.ts'
import { IOResult, materialize, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { sha256Hex } from '../../../utils/hash.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { resolveSource } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

async function hashOfStream(source: AsyncIterable<Uint8Array>): Promise<string> {
  const data = await materialize(source)
  return sha256Hex(data)
}

async function* sha256SingleStream(
  source: AsyncIterable<Uint8Array>,
  label: string,
): AsyncIterable<Uint8Array> {
  const digest = await hashOfStream(source)
  yield ENC.encode(`${digest}  ${label}\n`)
}

async function* sha256Multi(
  accessor: GitHubAccessor,
  paths: readonly PathSpec[],
  index: IndexCacheStore | undefined,
): AsyncIterable<Uint8Array> {
  for (const p of paths) {
    const digest = await hashOfStream(githubStream(accessor, p, index))
    yield ENC.encode(`${digest}  ${p.stripPrefix}\n`)
  }
}

async function sha256Check(
  accessor: GitHubAccessor,
  p: PathSpec,
  index: IndexCacheStore | undefined,
): Promise<[Uint8Array, number]> {
  const data = DEC.decode(await githubRead(accessor, p, index))
  const lines: string[] = []
  let failed = false
  const mountPrefix = p.prefix
  for (const line of data.split('\n')) {
    if (line.trim() === '') continue
    const idx = line.indexOf('  ')
    if (idx < 0) continue
    const expected = line.slice(0, idx)
    const filename = line.slice(idx + 2)
    const spec = new PathSpec({
      original: filename,
      directory: filename,
      resolved: false,
      prefix: mountPrefix,
    })
    const digest = await hashOfStream(githubStream(accessor, spec, index))
    if (digest === expected) {
      lines.push(`${filename}: OK`)
    } else {
      lines.push(`${filename}: FAILED`)
      failed = true
    }
  }
  return [ENC.encode(lines.join('\n') + '\n'), failed ? 1 : 0]
}

async function sha256sumCommand(
  accessor: GitHubAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const check = opts.flags.c === true
  const resolved =
    paths.length > 0 ? await resolveGlob(accessor, paths, opts.index ?? undefined) : []
  if (check && resolved.length > 0) {
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    const [out, exitCode] = await sha256Check(accessor, first, opts.index ?? undefined)
    const result: ByteSource = out
    return [result, new IOResult({ exitCode })]
  }
  if (resolved.length > 0) {
    return [
      sha256Multi(accessor, resolved, opts.index ?? undefined),
      new IOResult({ cache: resolved.map((p) => p.original) }),
    ]
  }
  let source: AsyncIterable<Uint8Array>
  try {
    source = resolveSource(opts.stdin, 'sha256sum: missing input')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
  }
  return [sha256SingleStream(source, '-'), new IOResult()]
}

export const GITHUB_SHA256SUM = command({
  name: 'sha256sum',
  resource: ResourceName.GITHUB,
  spec: specOf('sha256sum'),
  fn: sha256sumCommand,
})
