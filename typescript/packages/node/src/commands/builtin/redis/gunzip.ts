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
  materialize,
  resolveSource,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
} from '@struktoai/mirage-core'
import { unlink as redisUnlink } from '../../../core/redis/unlink.ts'
import { writeBytes as redisWrite } from '../../../core/redis/write.ts'
import { stream as redisStream } from '../../../core/redis/stream.ts'
import type { RedisAccessor } from '../../../accessor/redis.ts'

const ENC = new TextEncoder()

function makePathSpec(original: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: true })
}

async function gunzipCommand(
  accessor: RedisAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const keep = opts.flags.k === true
  const stdoutMode = opts.flags.c === true
  const testMode = opts.flags.t === true

  if (paths.length === 0) {
    let source: AsyncIterable<Uint8Array>
    try {
      source = resolveSource(opts.stdin, 'gunzip: missing input')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
    }
    const data = await materialize(source)
    const out = await gunzip(data)
    const result: ByteSource = out
    return [result, new IOResult()]
  }

  if (testMode) {
    for (const p of paths) {
      const raw = await materialize(redisStream(accessor, p))
      await gunzip(raw)
    }
    return [null, new IOResult()]
  }

  if (stdoutMode) {
    const chunks: Uint8Array[] = []
    for (const p of paths) {
      const raw = await materialize(redisStream(accessor, p))
      chunks.push(await gunzip(raw))
    }
    return [concat(chunks), new IOResult()]
  }

  const writes: Record<string, Uint8Array> = {}
  for (const p of paths) {
    const raw = await materialize(redisStream(accessor, p))
    const pStripped = p.stripPrefix
    const outPath = pStripped.endsWith('.gz') ? pStripped.slice(0, -3) : pStripped + '.out'
    const outData = await gunzip(raw)
    await redisWrite(accessor, makePathSpec(outPath), outData)
    writes[outPath] = outData
    if (!keep) await redisUnlink(accessor, p)
  }
  return [null, new IOResult({ writes })]
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.byteLength
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

export const REDIS_GUNZIP = command({
  name: 'gunzip',
  resource: ResourceName.REDIS,
  spec: specOf('gunzip'),
  fn: gunzipCommand,
  write: true,
})
