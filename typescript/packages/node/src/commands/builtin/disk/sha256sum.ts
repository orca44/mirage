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
  PathSpec,
  ResourceName,
  command,
  materialize,
  resolveSource,
  sha256Hex,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
} from '@struktoai/mirage-core'
import { stream as diskStream } from '../../../core/disk/stream.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

async function hashStream(source: AsyncIterable<Uint8Array>): Promise<string> {
  const data = await materialize(source)
  return sha256Hex(data)
}

async function* sha256SingleStream(
  source: AsyncIterable<Uint8Array>,
  label: string,
): AsyncIterable<Uint8Array> {
  const digest = await hashStream(source)
  yield ENC.encode(`${digest}  ${label}\n`)
}

async function* sha256Multi(
  accessor: DiskAccessor,
  paths: readonly PathSpec[],
): AsyncIterable<Uint8Array> {
  for (const p of paths) {
    const digest = await hashStream(diskStream(accessor, p))
    yield ENC.encode(`${digest}  ${p.stripPrefix}\n`)
  }
}

function makePathSpec(original: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: true })
}

async function sha256Check(accessor: DiskAccessor, p: PathSpec): Promise<[Uint8Array, number]> {
  const data = DEC.decode(await materialize(diskStream(accessor, p)))
  const lines: string[] = []
  let failed = false
  for (const line of data.split('\n')) {
    if (line.trim() === '') continue
    const idx = line.indexOf('  ')
    if (idx < 0) continue
    const expected = line.slice(0, idx)
    const filename = line.slice(idx + 2)
    const digest = await hashStream(diskStream(accessor, makePathSpec(filename)))
    if (digest === expected) lines.push(`${filename}: OK`)
    else {
      lines.push(`${filename}: FAILED`)
      failed = true
    }
  }
  return [ENC.encode(lines.join('\n') + '\n'), failed ? 1 : 0]
}

async function sha256sumCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const check = opts.flags.c === true
  if (check && paths.length > 0) {
    const first = paths[0]
    if (first === undefined) return [null, new IOResult()]
    const [out, exitCode] = await sha256Check(accessor, first)
    const result: ByteSource = out
    return [result, new IOResult({ exitCode })]
  }
  if (paths.length > 0) {
    return [sha256Multi(accessor, paths), new IOResult({ cache: paths.map((p) => p.stripPrefix) })]
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

export const RAM_SHA256SUM = command({
  name: 'sha256sum',
  resource: ResourceName.DISK,
  spec: specOf('sha256sum'),
  fn: sha256sumCommand,
})
