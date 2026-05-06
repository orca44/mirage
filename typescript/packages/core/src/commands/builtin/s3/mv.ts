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
import { rename as s3Rename } from '../../../core/s3/rename.ts'
import { stat as s3Stat } from '../../../core/s3/stat.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { type PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

async function pathExists(accessor: S3Accessor, path: PathSpec): Promise<boolean> {
  try {
    await s3Stat(accessor, path)
    return true
  } catch {
    return false
  }
}

async function mvCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length < 2) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('mv: requires src and dst\n') })]
  }
  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
  const src = resolved[0]
  const dst = resolved[1]
  if (src === undefined || dst === undefined) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('mv: requires src and dst\n') })]
  }
  if (opts.flags.n === true && (await pathExists(accessor, dst))) {
    return [null, new IOResult()]
  }
  await s3Rename(accessor, src, dst)
  const writes: Record<string, Uint8Array> = {
    [src.original]: new Uint8Array(),
    [dst.original]: new Uint8Array(),
  }
  const out: ByteSource | null =
    opts.flags.v === true ? ENC.encode(`'${src.original}' -> '${dst.original}'\n`) : null
  return [out, new IOResult({ writes })]
}

export const S3_MV = command({
  name: 'mv',
  resource: ResourceName.S3,
  spec: specOf('mv'),
  fn: mvCommand,
  write: true,
})
