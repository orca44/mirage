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
  Precision,
  ProvisionResult,
  ResourceName,
  command,
  evalJsonlStream,
  isJsonlPath,
  isStreamableJsonlExpr,
  jqEval,
  materialize,
  parseJsonAuto,
  parseJsonPath,
  readStdinAsync,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as opfsStream } from '../../../core/opfs/stream.ts'
import { stat as opfsStat } from '../../../core/opfs/stat.ts'
import type { OPFSAccessor } from '../../../accessor/opfs.ts'

const ENC = new TextEncoder()

export async function jqProvision(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  _opts: CommandOpts,
): Promise<ProvisionResult> {
  const [first] = paths
  const [expr] = texts
  if (first === undefined || expr === undefined) return new ProvisionResult({ command: 'jq' })
  try {
    const s = await opfsStat(accessor.rootHandle, first)
    const fileSize = s.size ?? 0
    if (isJsonlPath(first.original) && isStreamableJsonlExpr(expr)) {
      return new ProvisionResult({
        command: `jq '${expr}' ${first.original}`,
        networkReadLow: 0,
        networkReadHigh: fileSize,
        readOps: 1,
        precision: Precision.RANGE,
      })
    }
    return new ProvisionResult({
      command: `jq '${expr}' ${first.original}`,
      networkReadLow: fileSize,
      networkReadHigh: fileSize,
      readOps: 1,
      precision: Precision.EXACT,
    })
  } catch {
    return new ProvisionResult({ command: 'jq' })
  }
}

function formatResult(result: unknown, raw: boolean, compact: boolean): Uint8Array {
  if (raw && typeof result === 'string') return ENC.encode(result + '\n')
  const json = compact ? JSON.stringify(result) : JSON.stringify(result, null, 2)
  return ENC.encode(json + '\n')
}

function formatResults(
  result: unknown,
  raw: boolean,
  compact: boolean,
  spread: boolean,
): Uint8Array {
  if (spread && Array.isArray(result)) {
    const parts: Uint8Array[] = []
    for (const item of result) parts.push(formatResult(item, raw, compact))
    return concat(parts)
  }
  return formatResult(result, raw, compact)
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.byteLength
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

async function readFile(accessor: OPFSAccessor, p: PathSpec): Promise<Uint8Array> {
  return materialize(opfsStream(accessor.rootHandle, p))
}

async function jqCommand(
  accessor: OPFSAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const expression = texts[0]
  if (expression === undefined) {
    return [
      null,
      new IOResult({ exitCode: 1, stderr: ENC.encode('jq: usage: jq EXPRESSION [path]\n') }),
    ]
  }
  const raw = opts.flags.r === true
  const compact = opts.flags.c === true
  const slurp = opts.flags.s === true

  if (paths.length > 0) {
    const first = paths[0]
    if (first === undefined) return [null, new IOResult()]
    if (isJsonlPath(first.original) && isStreamableJsonlExpr(expression)) {
      return [evalJsonlStream(opfsStream(accessor.rootHandle, first), expression), new IOResult()]
    }
    const outputs: Uint8Array[] = []
    for (const p of paths) {
      const bytes = await readFile(accessor, p)
      let data = parseJsonPath(bytes, p.original)
      if (slurp) data = Array.isArray(data) ? data : [data]
      const result = await jqEval(data, expression.trim())
      const spread = expression.includes('[]')
      outputs.push(formatResults(result, raw, compact, spread))
    }
    const out: ByteSource = concat(outputs)
    return [out, new IOResult()]
  }

  const bytes = await readStdinAsync(opts.stdin)
  if (bytes === null) return [null, new IOResult()]
  let data = parseJsonAuto(bytes)
  if (slurp && !Array.isArray(data)) data = [data]
  const result = await jqEval(data, expression.trim())
  const spread = expression.includes('[]')
  return [formatResults(result, raw, compact, spread), new IOResult()]
}

export const OPFS_JQ = command({
  name: 'jq',
  resource: ResourceName.OPFS,
  spec: specOf('jq'),
  fn: jqCommand,
  provision: jqProvision,
})
