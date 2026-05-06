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
import { mkdir as s3Mkdir } from '../../../core/s3/mkdir.ts'
import { read as s3Read } from '../../../core/s3/read.ts'
import { write as s3Write } from '../../../core/s3/write.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { gzip, gunzip } from '../../../utils/compress.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readTar, writeTar, type TarEntry } from '../tar_helper.ts'

const ENC = new TextEncoder()

function makePathSpec(original: string, prefix: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: true, prefix })
}

async function compress(data: Uint8Array, z: boolean): Promise<Uint8Array> {
  if (!z) return data
  return gzip(data)
}

async function decompress(data: Uint8Array, z: boolean): Promise<Uint8Array> {
  if (!z) return data
  return gunzip(data)
}

async function tarCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const create = opts.flags.c === true
  const extract = opts.flags.x === true
  const list = opts.flags.t === true
  const z = opts.flags.z === true
  if (opts.flags.j === true || opts.flags.J === true) {
    return [
      null,
      new IOResult({ exitCode: 1, stderr: ENC.encode('tar: bzip2/xz not supported\n') }),
    ]
  }
  const fFlag = typeof opts.flags.f === 'string' ? opts.flags.f : null
  const CFlag = typeof opts.flags.C === 'string' ? opts.flags.C : null
  const stripN =
    typeof opts.flags.strip_components === 'string'
      ? Number.parseInt(opts.flags.strip_components, 10)
      : 0
  const exclude = typeof opts.flags.exclude === 'string' ? opts.flags.exclude : null
  const archivePath = fFlag
  const destPath = CFlag ?? '/'

  const resolved =
    paths.length > 0 ? await resolveGlob(accessor, paths, opts.index ?? undefined) : []
  const mountPrefix = resolved[0]?.prefix ?? ''

  if (create) {
    if (archivePath === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tar: -f is required\n') })]
    }
    const filtered =
      exclude !== null
        ? resolved.filter((p) => !p.original.split('/').pop()?.includes(exclude))
        : resolved
    const entries: TarEntry[] = []
    for (const p of filtered) {
      const data = await s3Read(accessor, p, opts.index ?? undefined)
      entries.push({ name: p.original.replace(/^\/+/, ''), data, isFile: true })
    }
    const archive = await compress(writeTar(entries), z)
    await s3Write(accessor, makePathSpec(archivePath, mountPrefix), archive)
    return [null, new IOResult({ writes: { [archivePath]: archive } })]
  }

  if (list) {
    if (archivePath === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tar: -f is required\n') })]
    }
    const archiveSpec = makePathSpec(archivePath, mountPrefix)
    const raw = await s3Read(accessor, archiveSpec, opts.index ?? undefined)
    const data = await decompress(raw, z)
    const entries = readTar(data)
    const out: ByteSource = ENC.encode(entries.map((e) => e.name).join('\n') + '\n')
    return [out, new IOResult()]
  }

  if (extract) {
    if (archivePath === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tar: -f is required\n') })]
    }
    const archiveSpec = makePathSpec(archivePath, mountPrefix)
    const raw = await s3Read(accessor, archiveSpec, opts.index ?? undefined)
    const data = await decompress(raw, z)
    const writes: Record<string, Uint8Array> = {}
    for (const entry of readTar(data)) {
      if (!entry.isFile) continue
      const nameParts = entry.name.split('/')
      const stripped = stripN > 0 ? nameParts.slice(stripN) : nameParts
      if (stripped.length === 0) continue
      const outPath = destPath.replace(/\/+$/, '') + '/' + stripped.join('/')
      const parts = outPath.replace(/^\/+|\/+$/g, '').split('/')
      for (let pi = 1; pi < parts.length; pi++) {
        const d = '/' + parts.slice(0, pi).join('/')
        try {
          await s3Mkdir(accessor, makePathSpec(d, mountPrefix))
        } catch {
          // already exists
        }
      }
      await s3Write(accessor, makePathSpec(outPath, mountPrefix), entry.data)
      writes[outPath] = entry.data
    }
    return [null, new IOResult({ writes })]
  }

  return [
    null,
    new IOResult({ exitCode: 1, stderr: ENC.encode('tar: must specify -c, -x, or -t\n') }),
  ]
}

export const S3_TAR = command({
  name: 'tar',
  resource: ResourceName.S3,
  spec: specOf('tar'),
  fn: tarCommand,
  write: true,
})
