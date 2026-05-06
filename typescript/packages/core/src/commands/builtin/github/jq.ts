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
import { read as githubRead } from '../../../core/github/read.ts'
import { resolveGlob } from '../../../core/github/glob.ts'
import { stat as githubStat } from '../../../core/github/stat.ts'
import { stream as githubStream } from '../../../core/github/read.ts'
import {
  concatBytes,
  evalJsonlStream,
  formatJqOutput,
  isJsonlPath,
  isStreamableJsonlExpr,
  jqEval,
  parseJsonAuto,
  parseJsonPath,
} from '../../../core/jq/index.ts'
import { Precision, ProvisionResult } from '../../../provision/types.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()

export async function jqProvision(
  accessor: GitHubAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<ProvisionResult> {
  const [first] = paths
  const [expr] = texts
  if (first === undefined || expr === undefined) return new ProvisionResult({ command: 'jq' })
  try {
    const s = await githubStat(accessor, first, opts.index ?? undefined)
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

async function jqCommand(
  accessor: GitHubAccessor,
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
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    if (isJsonlPath(first.original) && isStreamableJsonlExpr(expression)) {
      return [
        evalJsonlStream(githubStream(accessor, first, opts.index ?? undefined), expression),
        new IOResult(),
      ]
    }
    const outputs: Uint8Array[] = []
    for (const p of resolved) {
      const bytes = await githubRead(accessor, p, opts.index ?? undefined)
      let data = parseJsonPath(bytes, p.original)
      if (slurp) data = Array.isArray(data) ? data : [data]
      const result = await jqEval(data, expression.trim())
      const spread = expression.includes('[]')
      outputs.push(formatJqOutput(result, raw, compact, spread))
    }
    const out: ByteSource = concatBytes(outputs)
    return [out, new IOResult()]
  }

  const bytes = await readStdinAsync(opts.stdin)
  if (bytes === null) return [null, new IOResult()]
  let data = parseJsonAuto(bytes)
  if (slurp && !Array.isArray(data)) data = [data]
  const result = await jqEval(data, expression.trim())
  const spread = expression.includes('[]')
  return [formatJqOutput(result, raw, compact, spread), new IOResult()]
}

export const GITHUB_JQ = command({
  name: 'jq',
  resource: ResourceName.GITHUB,
  spec: specOf('jq'),
  fn: jqCommand,
  provision: jqProvision,
})
