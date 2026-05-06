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
import { unlink as s3Unlink } from '../../../core/s3/unlink.ts'
import { write as s3Write } from '../../../core/s3/write.ts'
import { IOResult, materialize, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { gzip, gunzip } from '../../../utils/compress.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { resolveSource } from '../utils/stream.ts'

const ENC = new TextEncoder()

function makePathSpec(original: string, prefix: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: true, prefix })
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

async function gzipCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const decompress = opts.flags.d === true
  const keep = opts.flags.k === true
  const stdoutMode = opts.flags.c === true

  if (paths.length === 0) {
    let source: AsyncIterable<Uint8Array>
    try {
      source = resolveSource(opts.stdin, 'gzip: missing input')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
    }
    const data = await materialize(source)
    const out = decompress ? await gunzip(data) : await gzip(data)
    const result: ByteSource = out
    return [result, new IOResult()]
  }

  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)

  if (stdoutMode) {
    const chunks: Uint8Array[] = []
    for (const p of resolved) {
      const raw = await s3Read(accessor, p, opts.index ?? undefined)
      const out = decompress ? await gunzip(raw) : await gzip(raw)
      chunks.push(out)
    }
    return [concat(chunks), new IOResult()]
  }

  const writes: Record<string, Uint8Array> = {}
  for (const p of resolved) {
    const raw = await s3Read(accessor, p, opts.index ?? undefined)
    const pStripped = p.stripPrefix
    let outPath: string
    let outData: Uint8Array
    if (decompress) {
      outPath = pStripped.endsWith('.gz') ? pStripped.slice(0, -3) : pStripped + '.out'
      outData = await gunzip(raw)
    } else {
      outPath = pStripped + '.gz'
      outData = await gzip(raw)
    }
    await s3Write(accessor, makePathSpec(outPath, p.prefix), outData)
    writes[outPath] = outData
    if (!keep) await s3Unlink(accessor, p)
  }
  return [null, new IOResult({ writes })]
}

export const S3_GZIP = command({
  name: 'gzip',
  resource: ResourceName.S3,
  spec: specOf('gzip'),
  fn: gzipCommand,
  write: true,
})
