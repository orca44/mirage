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
  AsyncLineIterator,
  IOResult,
  Precision,
  ProvisionResult,
  ResourceName,
  command,
  headerAggregate,
  resolveSource,
  specOf,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as opfsStream } from '../../../../core/opfs/stream.ts'
import { stat as opfsStat } from '../../../../core/opfs/stat.ts'
import type { OPFSAccessor } from '../../../../accessor/opfs.ts'

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

async function* headMulti(
  accessor: OPFSAccessor,
  paths: readonly PathSpec[],
  lines: number,
  bytesMode: number | null,
): AsyncIterable<Uint8Array> {
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]
    if (p === undefined) continue
    if (paths.length > 1) {
      const prefix = i > 0 ? '\n' : ''
      yield ENC.encode(`${prefix}==> ${p.original} <==\n`)
    }
    const source = opfsStream(accessor.rootHandle, p)
    for await (const chunk of headStream(source, lines, bytesMode)) yield chunk
  }
}

export async function headProvision(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<ProvisionResult> {
  const [first] = paths
  if (first === undefined) return new ProvisionResult({ command: 'head' })
  try {
    const s = await opfsStat(accessor.rootHandle, first)
    const fileSize = s.size ?? 0
    const nFlag = typeof opts.flags.n === 'string' ? Number.parseInt(opts.flags.n, 10) : null
    const lines = nFlag !== null && Number.isFinite(nFlag) ? nFlag : 10
    const avgLine = 80
    const low = Math.min(lines * avgLine, fileSize)
    return new ProvisionResult({
      command: `head ${first.original}`,
      networkReadLow: low,
      networkReadHigh: fileSize,
      readOps: 1,
      precision: Precision.RANGE,
    })
  } catch {
    return new ProvisionResult({ command: 'head' })
  }
}

async function headCommand(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nRaw = typeof opts.flags.n === 'string' ? opts.flags.n : null
  const cRaw = typeof opts.flags.c === 'string' ? opts.flags.c : null
  const lineCount = nRaw !== null ? Number.parseInt(nRaw, 10) : 10
  const byteCount = cRaw !== null ? Number.parseInt(cRaw, 10) : null
  if (paths.length > 0) {
    for (const p of paths) await opfsStat(accessor.rootHandle, p)
    return [headMulti(accessor, paths, lineCount, byteCount), new IOResult()]
  }
  try {
    const source = resolveSource(opts.stdin, 'head: missing operand')
    return [headStream(source, lineCount, byteCount), new IOResult()]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
  }
}

export const OPFS_HEAD = command({
  name: 'head',
  resource: ResourceName.OPFS,
  spec: specOf('head'),
  fn: headCommand,
  provision: headProvision,
  aggregate: headerAggregate,
})
