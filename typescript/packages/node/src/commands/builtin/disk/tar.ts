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
  gunzip,
  gzip,
  materialize,
  readTar,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type TarEntry,
  writeTar,
} from '@struktoai/mirage-core'
import { stream as diskStream } from '../../../core/disk/stream.ts'
import { writeBytes as diskWrite } from '../../../core/disk/write.ts'
import { mkdir as diskMkdir } from '../../../core/disk/mkdir.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

const ENC = new TextEncoder()

function makePathSpec(original: string, prefix: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: true, prefix })
}

function fnmatch(name: string, pattern: string): boolean {
  let re = '^'
  for (const ch of pattern) {
    if (ch === '*') re += '.*'
    else if (ch === '?') re += '.'
    else if (/[.+^${}()|[\]\\]/.test(ch)) re += '\\' + ch
    else re += ch
  }
  re += '$'
  return new RegExp(re).test(name)
}

function hasGzipMagic(data: Uint8Array): boolean {
  return data.byteLength >= 2 && data[0] === 0x1f && data[1] === 0x8b
}

async function decompress(data: Uint8Array, z: boolean): Promise<Uint8Array> {
  if (z || hasGzipMagic(data)) return gunzip(data)
  return data
}

async function tarCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const create = opts.flags.c === true
  const extract = opts.flags.x === true
  const list = opts.flags.t === true
  const z = opts.flags.z === true
  const verbose = opts.flags.v === true
  // -j (bzip2) / -J (xz) are not supported: Node's stdlib only ships gzip/deflate.
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
  const mountPrefix = opts.mountPrefix ?? ''
  const archivePath = fFlag
  const destPath = CFlag ?? '/'
  const verboseLines: string[] = []

  if (create) {
    if (archivePath === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tar: -f is required\n') })]
    }
    const filtered =
      exclude !== null
        ? paths.filter((p) => {
            const name = p.original.split('/').pop() ?? ''
            return !fnmatch(name, exclude)
          })
        : paths
    const entries: TarEntry[] = []
    for (const p of filtered) {
      const data = await materialize(diskStream(accessor, p))
      const name = p.original.replace(/^\/+/, '')
      entries.push({ name, data, isFile: true })
      if (verbose) verboseLines.push(name)
    }
    const raw = writeTar(entries)
    const archive = z ? await gzip(raw) : raw
    await diskWrite(accessor, makePathSpec(archivePath, mountPrefix), archive)
    const stdout = verbose ? ENC.encode(verboseLines.join('\n') + '\n') : null
    return [stdout, new IOResult({ writes: { [archivePath]: archive } })]
  }

  if (list) {
    if (archivePath === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tar: -f is required\n') })]
    }
    const raw = await materialize(diskStream(accessor, makePathSpec(archivePath, mountPrefix)))
    const data = await decompress(raw, z)
    const entries = readTar(data)
    const out: ByteSource = ENC.encode(entries.map((e) => e.name).join('\n') + '\n')
    return [out, new IOResult()]
  }

  if (extract) {
    if (archivePath === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tar: -f is required\n') })]
    }
    const raw = await materialize(diskStream(accessor, makePathSpec(archivePath, mountPrefix)))
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
          await diskMkdir(accessor, makePathSpec(d, mountPrefix))
        } catch {
          // already exists
        }
      }
      await diskWrite(accessor, makePathSpec(outPath, mountPrefix), entry.data)
      writes[outPath] = entry.data
      if (verbose) verboseLines.push(entry.name)
    }
    const stdout = verbose ? ENC.encode(verboseLines.join('\n') + '\n') : null
    return [stdout, new IOResult({ writes })]
  }

  return [
    null,
    new IOResult({ exitCode: 1, stderr: ENC.encode('tar: must specify -c, -x, or -t\n') }),
  ]
}

export const DISK_TAR = command({
  name: 'tar',
  resource: ResourceName.DISK,
  spec: specOf('tar'),
  fn: tarCommand,
  write: true,
})
