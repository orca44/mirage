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

import type { DropboxAccessor } from '../../../accessor/dropbox.ts'
import { resolveGlob } from '../../../core/dropbox/glob.ts'
import { read as dropboxRead } from '../../../core/dropbox/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { compareKeys, sortKey, type SortKeyOptions } from '../sort_helper.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function parseKeyOptions(flags: Record<string, string | boolean>): SortKeyOptions {
  return {
    keyField: typeof flags.k === 'string' ? Number.parseInt(flags.k, 10) : null,
    fieldSep: typeof flags.t === 'string' ? flags.t : null,
    ignoreCase: flags.f === true,
    numeric: flags.n === true,
    humanNumeric: flags.h === true,
    version: flags.V === true,
    month: flags.M === true,
  }
}

async function sortCommand(
  accessor: DropboxAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  let text: string
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    text = DEC.decode(await dropboxRead(accessor, first, opts.index ?? undefined))
  } else {
    const raw = await readStdinAsync(opts.stdin)
    if (raw === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('sort: missing operand\n') })]
    }
    text = DEC.decode(raw)
  }
  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const keyOpts = parseKeyOptions(opts.flags)
  const reverse = opts.flags.r === true
  const unique = opts.flags.u === true
  const decorated = lines.map((line) => ({ line, key: sortKey(line, keyOpts) }))
  decorated.sort((a, b) => compareKeys(a.key, b.key))
  if (reverse) decorated.reverse()
  let result: string[]
  if (unique) {
    const seen = new Set<string>()
    result = []
    for (const d of decorated) {
      const k = JSON.stringify(d.key)
      if (!seen.has(k)) {
        seen.add(k)
        result.push(d.line)
      }
    }
  } else {
    result = decorated.map((d) => d.line)
  }
  const output = result.length > 0 ? result.join('\n') + '\n' : ''
  const out: ByteSource = ENC.encode(output)
  return [out, new IOResult()]
}

export const DROPBOX_SORT = command({
  name: 'sort',
  resource: ResourceName.DROPBOX,
  spec: specOf('sort'),
  fn: sortCommand,
})
