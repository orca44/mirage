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
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

function posixNormpath(p: string): string {
  const isAbs = p.startsWith('/')
  const parts = p.split('/')
  const out: string[] = []
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') {
        out.pop()
      } else if (!isAbs) {
        out.push('..')
      }
      continue
    }
    out.push(seg)
  }
  const joined = out.join('/')
  if (isAbs) return '/' + joined
  return joined === '' ? '.' : joined
}

async function readlinkCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('readlink: missing operand\n') })]
  }
  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
  const fFlag = opts.flags.f === true
  const eFlag = opts.flags.e === true
  const mFlag = opts.flags.m === true
  const nFlag = opts.flags.n === true
  const normalize = fFlag || eFlag || mFlag
  const results: string[] = []
  for (const p of resolved) {
    let vp = p.original
    if (normalize) vp = posixNormpath(vp)
    results.push(vp)
  }
  let text = results.join('\n')
  if (!nFlag) text += '\n'
  const out: ByteSource = ENC.encode(text)
  return [out, new IOResult()]
}

export const S3_READLINK = command({
  name: 'readlink',
  resource: ResourceName.S3,
  spec: specOf('readlink'),
  fn: readlinkCommand,
})
