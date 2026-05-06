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
import { exists as s3Exists } from '../../../core/s3/exists.ts'
import { resolveGlob } from '../../../core/s3/glob.ts'
import { read as s3Read } from '../../../core/s3/read.ts'
import { write as s3Write } from '../../../core/s3/write.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { type PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

async function lnCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length < 2) {
    return [
      null,
      new IOResult({ exitCode: 1, stderr: ENC.encode('ln: usage: ln [-s] [-f] source dest\n') }),
    ]
  }
  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
  const source = resolved[0]
  const dest = resolved[1]
  if (source === undefined || dest === undefined) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('ln: missing operand\n') })]
  }
  if (opts.flags.n === true && (await s3Exists(accessor, dest))) {
    return [null, new IOResult()]
  }
  const data = await s3Read(accessor, source, opts.index ?? undefined)
  await s3Write(accessor, dest, data)
  const out: ByteSource | null =
    opts.flags.v === true ? ENC.encode(`'${source.original}' -> '${dest.original}'\n`) : null
  return [out, new IOResult({ writes: { [dest.original]: data } })]
}

export const S3_LN = command({
  name: 'ln',
  resource: ResourceName.S3,
  spec: specOf('ln'),
  fn: lnCommand,
  write: true,
})
