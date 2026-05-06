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
  AsyncLineIterator,
  IOResult,
  ResourceName,
  command,
  resolveSource,
  specOf,
  wrapBytes,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import type { EmailAccessor } from '../../../accessor/email.ts'
import { resolveGlob } from '../../../core/email/glob.ts'
import { read as emailRead } from '../../../core/email/read.ts'
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
  accessor: EmailAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nFlag = opts.flags.n === true
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    const data = await emailRead(accessor, first, opts.index ?? undefined)
    const io = new IOResult({ reads: { [first.stripPrefix]: data }, cache: [first.stripPrefix] })
    if (nFlag) return [numberLinesStream(wrapBytes(data)), io]
    return [data, io]
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

export const EMAIL_CAT = command({
  name: 'cat',
  resource: ResourceName.EMAIL,
  spec: specOf('cat'),
  fn: catCommand,
  provision: fileReadProvision,
})
