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
  ResourceName,
  command,
  specOf,
  type Accessor,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'

const ENC = new TextEncoder()

function normPath(p: string): string {
  const parts = p.split('/')
  const out: string[] = []
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length > 0) out.pop()
      continue
    }
    out.push(seg)
  }
  const leading = p.startsWith('/') ? '/' : ''
  return leading + out.join('/') || (leading !== '' ? '/' : '.')
}

// eslint-disable-next-line @typescript-eslint/require-await
async function readlinkCommand(
  _accessor: Accessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('readlink: missing operand\n') })]
  }
  const normalize = opts.flags.f === true || opts.flags.e === true || opts.flags.m === true
  const noNewline = opts.flags.n === true
  const results: string[] = []
  for (const p of paths) {
    let vp = p.prefix !== '' ? p.prefix + '/' + p.original.replace(/^\/+/, '') : p.original
    if (normalize) vp = normPath(vp)
    results.push(vp)
  }
  let text = results.join('\n')
  if (!noNewline) text += '\n'
  const out: ByteSource = ENC.encode(text)
  return [out, new IOResult()]
}

export const OPFS_READLINK = command({
  name: 'readlink',
  resource: ResourceName.OPFS,
  spec: specOf('readlink'),
  fn: readlinkCommand,
})
