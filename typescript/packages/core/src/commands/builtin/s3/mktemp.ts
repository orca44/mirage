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
import { mkdir as s3Mkdir } from '../../../core/s3/mkdir.ts'
import { write as s3Write } from '../../../core/s3/write.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

function randomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)] ?? ''
  }
  return out
}

function makePathSpec(original: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: true })
}

async function mktempCommand(
  accessor: S3Accessor,
  _paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const tFlag = opts.flags.t === true
  const parent = tFlag ? '/tmp' : typeof opts.flags.p === 'string' ? opts.flags.p : '/tmp'
  const suffix = randomSuffix()
  const templateArg = texts[0]
  const template = templateArg !== undefined && templateArg !== '' ? templateArg : 'tmp.XXXXXXXXXX'
  const xRun = /X+$/.exec(template)
  let name: string
  if (xRun !== null) {
    name = template.slice(0, xRun.index) + suffix
  } else {
    name = `${template}.${suffix}`
  }
  const path = `${parent.replace(/\/+$/, '')}/${name}`
  const spec = makePathSpec(path)
  if (opts.flags.d === true) {
    await s3Mkdir(accessor, spec)
  } else {
    await s3Write(accessor, spec, new Uint8Array(0))
  }
  const result: ByteSource = ENC.encode(path + '\n')
  return [result, new IOResult({ writes: { [path]: new Uint8Array() } })]
}

export const S3_MKTEMP = command({
  name: 'mktemp',
  resource: ResourceName.S3,
  spec: specOf('mktemp'),
  fn: mktempCommand,
  write: true,
})
