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
  parquetHead,
  materialize,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '../../../../index.ts'
import { stream as s3Stream } from '../../../../core/s3/stream.ts'
import type { S3Accessor } from '../../../../accessor/s3.ts'

const ENC = new TextEncoder()

async function headParquetCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('head: missing operand\n') })]
  }
  const first = paths[0]
  if (first === undefined) return [null, new IOResult()]
  const n = typeof opts.flags.n === 'string' ? Number.parseInt(opts.flags.n, 10) : 10
  try {
    const raw = await materialize(s3Stream(accessor, first))
    const result = await parquetHead(raw, n)
    const out: ByteSource = result
    return [out, new IOResult({ cache: [first.stripPrefix] })]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode(`head: ${first.original}: failed to read as parquet: ${msg}\n`),
      }),
    ]
  }
}

export const S3_HEAD_PARQUET = command({
  name: 'head',
  resource: ResourceName.S3,
  spec: specOf('head'),
  filetype: '.parquet',
  fn: headParquetCommand,
})
