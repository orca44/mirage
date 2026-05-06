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
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
} from '@struktoai/mirage-core'
import { writeBytes as opfsWrite } from '../../../core/opfs/write.ts'
import { mkdir as opfsMkdir } from '../../../core/opfs/mkdir.ts'
import type { OPFSAccessor } from '../../../accessor/opfs.ts'

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
  accessor: OPFSAccessor,
  paths: PathSpec[],
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
  await opfsMkdir(accessor.rootHandle, makePathSpec(parent), true)
  if (opts.flags.d === true) {
    await opfsMkdir(accessor.rootHandle, makePathSpec(path))
  } else {
    await opfsWrite(accessor.rootHandle, makePathSpec(path), new Uint8Array(0))
  }
  const result: ByteSource = ENC.encode(path + '\n')
  return [result, new IOResult()]
}

export const OPFS_MKTEMP = command({
  name: 'mktemp',
  resource: ResourceName.OPFS,
  spec: specOf('mktemp'),
  fn: mktempCommand,
  write: true,
})
