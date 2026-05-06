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
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

function posixBasename(p: string): string {
  const stripped = p.replace(/\/+$/, '')
  const idx = stripped.lastIndexOf('/')
  return idx >= 0 ? stripped.slice(idx + 1) : stripped
}

// eslint-disable-next-line @typescript-eslint/require-await
async function basenameCommand(
  _accessor: S3Accessor,
  _paths: PathSpec[],
  texts: string[],
  _opts: CommandOpts,
): Promise<CommandFnResult> {
  const lines = texts.map(posixBasename)
  const out: ByteSource = ENC.encode(lines.join('\n') + '\n')
  return [out, new IOResult()]
}

export const S3_BASENAME = command({
  name: 'basename',
  resource: ResourceName.S3,
  spec: specOf('basename'),
  fn: basenameCommand,
})
