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
import { stream as redisStream } from '../../../core/redis/stream.ts'
import { writeBytes as redisWrite } from '../../../core/redis/write.ts'
import { mkdir as redisMkdir } from '../../../core/redis/mkdir.ts'
import type { RedisAccessor } from '../../../accessor/redis.ts'

const ENC = new TextEncoder()

function makePathSpec(original: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: true })
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
  accessor: RedisAccessor,
  paths: PathSpec[],
  texts: string[],
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

  if (create) {
    if (archivePath === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tar: -f is required\n') })]
    }
    const filtered =
      exclude !== null
        ? paths.filter((p) => !p.original.split('/').pop()?.includes(exclude))
        : paths
    const entries: TarEntry[] = []
    for (const p of filtered) {
      const data = await materialize(redisStream(accessor, p))
      entries.push({ name: p.original.replace(/^\/+/, ''), data, isFile: true })
    }
    const archive = await compress(writeTar(entries), z)
    await redisWrite(accessor, makePathSpec(archivePath), archive)
    return [null, new IOResult({ writes: { [archivePath]: archive } })]
  }

  if (list) {
    if (archivePath === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tar: -f is required\n') })]
    }
    const raw = await materialize(redisStream(accessor, makePathSpec(archivePath)))
    const data = await decompress(raw, z)
    const entries = readTar(data)
    const out: ByteSource = ENC.encode(entries.map((e) => e.name).join('\n') + '\n')
    return [out, new IOResult()]
  }

  if (extract) {
    if (archivePath === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tar: -f is required\n') })]
    }
    const raw = await materialize(redisStream(accessor, makePathSpec(archivePath)))
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
          await redisMkdir(accessor, makePathSpec(d))
        } catch {
          // already exists
        }
      }
      await redisWrite(accessor, makePathSpec(outPath), entry.data)
      writes[outPath] = entry.data
    }
    return [null, new IOResult({ writes })]
  }

  return [
    null,
    new IOResult({ exitCode: 1, stderr: ENC.encode('tar: must specify -c, -x, or -t\n') }),
  ]
}

export const REDIS_TAR = command({
  name: 'tar',
  resource: ResourceName.REDIS,
  spec: specOf('tar'),
  fn: tarCommand,
  write: true,
})
