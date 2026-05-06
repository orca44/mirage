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
  specOf,
  type CommandFnResult,
  type CommandOpts,
} from '@struktoai/mirage-core'
import { copy as diskCopy } from '../../../core/disk/copy.ts'
import { find as diskFind } from '../../../core/disk/find.ts'
import { stat as diskStat } from '../../../core/disk/stat.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

async function exists(accessor: DiskAccessor, path: PathSpec): Promise<boolean> {
  try {
    await diskStat(accessor, path)
    return true
  } catch {
    return false
  }
}

function toPathSpec(strPath: string, prefix: string): PathSpec {
  return new PathSpec({
    original: strPath,
    directory: strPath,
    resolved: false,
    prefix,
  })
}

async function cpCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length < 2) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: new TextEncoder().encode('cp: missing operand\n'),
      }),
    ]
  }
  const recursive = opts.flags.r === true || opts.flags.R === true || opts.flags.a === true
  const noClobber = opts.flags.n === true
  const verbose = opts.flags.v === true
  const dst = paths[paths.length - 1]
  if (dst === undefined) return [null, new IOResult()]
  const lines: string[] = []

  if (recursive) {
    const src = paths[0]
    if (src === undefined) return [null, new IOResult()]
    const srcBase = src.stripPrefix.replace(/\/+$/, '')
    const dstBase = dst.stripPrefix.replace(/\/+$/, '')
    const entries = await diskFind(accessor, src, { type: 'f' })
    for (const entry of entries) {
      const rel = entry.slice(srcBase.length)
      const dstPath = dstBase + rel
      const dstSpec = toPathSpec(dstPath, dst.prefix)
      if (noClobber && (await exists(accessor, dstSpec))) continue
      const srcSpec = toPathSpec(entry, src.prefix)
      await diskCopy(accessor, srcSpec, dstSpec)
      if (verbose) lines.push(`${entry} -> ${dstPath}`)
    }
    const out = lines.length > 0 ? new TextEncoder().encode(lines.join('\n') + '\n') : null
    return [out, new IOResult()]
  }

  const sources = paths.slice(0, -1)
  for (const src of sources) {
    if (noClobber && (await exists(accessor, dst))) continue
    await diskCopy(accessor, src, dst)
    if (verbose) lines.push(`${src.original} -> ${dst.original}`)
  }
  const out = lines.length > 0 ? new TextEncoder().encode(lines.join('\n') + '\n') : null
  return [out, new IOResult()]
}

export const DISK_CP = command({
  name: 'cp',
  resource: ResourceName.DISK,
  spec: specOf('cp'),
  fn: cpCommand,
  write: true,
})
