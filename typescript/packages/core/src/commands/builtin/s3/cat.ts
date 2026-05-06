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
import { AsyncLineIterator } from '../../../io/async_line_iterator.ts'
import { CachableAsyncIterator } from '../../../io/cachable_iterator.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { resolveGlob } from '../../../core/s3/glob.ts'
import { stat as s3Stat } from '../../../core/s3/stat.ts'
import { stream as s3Stream } from '../../../core/s3/stream.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { resolveSource } from '../utils/stream.ts'
import { fileReadProvision } from './provision.ts'

const ENC = new TextEncoder()

async function* numberLinesStream(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  let num = 1
  const lineIter = new AsyncLineIterator(source)
  for await (const line of lineIter) {
    yield ENC.encode(`     ${String(num)}\t`)
    yield line
    yield ENC.encode('\n')
    num += 1
  }
}

async function catCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nFlag = opts.flags.n === true
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    await s3Stat(accessor, first)
    const cachable = new CachableAsyncIterator(s3Stream(accessor, first))
    const io = new IOResult({
      reads: { [first.stripPrefix]: cachable },
      cache: [first.stripPrefix],
    })
    const out: ByteSource = nFlag ? numberLinesStream(cachable) : cachable
    return [out, io]
  }
  try {
    const source = resolveSource(opts.stdin, 'cat: missing operand')
    if (nFlag) return [numberLinesStream(source), new IOResult()]
    return [source, new IOResult()]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
  }
}

export const S3_CAT = command({
  name: 'cat',
  resource: ResourceName.S3,
  spec: specOf('cat'),
  fn: catCommand,
  provision: fileReadProvision,
})
