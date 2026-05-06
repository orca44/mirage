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

import type { S3Accessor } from '../../../accessor/s3.ts'
import { resolveGlob } from '../../../core/s3/glob.ts'
import { read as s3Read } from '../../../core/s3/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { type PathSpec, ResourceName } from '../../../types.ts'
import { gunzip } from '../../../utils/compress.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()

async function zcatCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  let raw: Uint8Array
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('zcat: missing input\n') })]
    }
    raw = await s3Read(accessor, first, opts.index ?? undefined)
  } else {
    const stdinBytes = await readStdinAsync(opts.stdin)
    if (stdinBytes === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('zcat: missing input\n') })]
    }
    raw = stdinBytes
  }
  const out = await gunzip(raw)
  const result: ByteSource = out
  return [result, new IOResult()]
}

export const S3_ZCAT = command({
  name: 'zcat',
  resource: ResourceName.S3,
  spec: specOf('zcat'),
  fn: zcatCommand,
})
