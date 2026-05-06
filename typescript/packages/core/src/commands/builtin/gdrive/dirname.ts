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

import type { GDriveAccessor } from '../../../accessor/gdrive.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

function dirnameOf(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx === -1) return '.'
  if (idx === 0) return '/'
  return trimmed.slice(0, idx)
}

function dirnameCommand(
  _accessor: GDriveAccessor,
  _paths: PathSpec[],
  texts: string[],
  _opts: CommandOpts,
): CommandFnResult {
  const lines = texts.map((t) => dirnameOf(t))
  const out: ByteSource = ENC.encode(lines.join('\n') + '\n')
  return [out, new IOResult()]
}

export const GDRIVE_DIRNAME = command({
  name: 'dirname',
  resource: ResourceName.GDRIVE,
  spec: specOf('dirname'),
  fn: dirnameCommand,
})
