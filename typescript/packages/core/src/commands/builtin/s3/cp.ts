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
import { copy as s3Copy } from '../../../core/s3/copy.ts'
import { find as s3Find } from '../../../core/s3/find.ts'
import { resolveGlob } from '../../../core/s3/glob.ts'
import { stat as s3Stat } from '../../../core/s3/stat.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
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

function makePathSpec(original: string, prefix: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: true, prefix })
}

async function cpCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length < 2) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('cp: requires src and dst\n') })]
  }
  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
  const recursive = opts.flags.r === true || opts.flags.R === true || opts.flags.a === true
  const noClobber = opts.flags.n === true
  const verbose = opts.flags.v === true
  const src = resolved[0]
  const dst = resolved[1]
  if (src === undefined || dst === undefined) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('cp: requires src and dst\n') })]
  }
  const verboseLines: string[] = []

  if (recursive) {
    const srcBase = src.stripPrefix.replace(/\/+$/, '')
    const dstBase = dst.stripPrefix.replace(/\/+$/, '')
    const entries = await s3Find(accessor, src, { type: 'f' })
    const writes: Record<string, Uint8Array> = {}
    for (const entry of entries) {
      const rel = entry.slice(srcBase.length)
      const dstPath = dstBase + rel
      const dstSpec = makePathSpec(dstPath, src.prefix)
      if (noClobber && (await pathExists(accessor, dstSpec))) continue
      const srcSpec = makePathSpec(entry, src.prefix)
      await s3Copy(accessor, srcSpec, dstSpec)
      if (verbose) verboseLines.push(`${entry} -> ${dstPath}`)
      writes[dstPath] = new Uint8Array()
    }
    const output: ByteSource | null =
      verboseLines.length > 0 ? ENC.encode(verboseLines.join('\n') + '\n') : null
    return [output, new IOResult({ writes })]
  }

  if (noClobber && (await pathExists(accessor, dst))) {
    return [null, new IOResult()]
  }
  await s3Copy(accessor, src, dst)
  const output: ByteSource | null = verbose
    ? ENC.encode(`${src.original} -> ${dst.original}\n`)
    : null
  return [output, new IOResult({ writes: { [dst.original]: new Uint8Array() } })]
}

export const S3_CP = command({
  name: 'cp',
  resource: ResourceName.S3,
  spec: specOf('cp'),
  fn: cpCommand,
  write: true,
})
