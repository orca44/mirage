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
  parquetDescribe,
  materialize,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as diskStream } from '../../../../core/disk/stream.ts'
import type { DiskAccessor } from '../../../../accessor/disk.ts'

const ENC = new TextEncoder()

async function fileParquetCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  _texts: string[],
  _opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('file: missing operand\n') })]
  }
  const first = paths[0]
  if (first === undefined) return [null, new IOResult()]
  try {
    const raw = await materialize(diskStream(accessor, first))
    const result = parquetDescribe(raw)
    const out: ByteSource = ENC.encode(result)
    return [
      out,
      new IOResult({
        reads: { [first.stripPrefix]: raw },
        cache: [first.stripPrefix],
      }),
    ]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode(`file: ${first.original}: failed to read as parquet: ${msg}\n`),
      }),
    ]
  }
}

export const DISK_FILE_PARQUET = command({
  name: 'file',
  resource: ResourceName.DISK,
  spec: specOf('file'),
  filetype: '.parquet',
  fn: fileParquetCommand,
})
