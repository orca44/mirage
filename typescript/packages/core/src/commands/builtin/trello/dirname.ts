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

import type { TrelloAccessor } from '../../../accessor/trello.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

function posixDirname(p: string): string {
  const idx = p.lastIndexOf('/')
  if (idx < 0) return ''
  if (idx === 0) return '/'
  let head = p.slice(0, idx)
  if (head !== '' && /^\/+$/.test(head)) return '/'
  head = head.replace(/\/+$/, '')
  return head === '' ? '/' : head
}

// eslint-disable-next-line @typescript-eslint/require-await
async function dirnameCommand(
  _accessor: TrelloAccessor,
  _paths: PathSpec[],
  texts: string[],
  _opts: CommandOpts,
): Promise<CommandFnResult> {
  const lines = texts.map(posixDirname)
  const out: ByteSource = ENC.encode(lines.join('\n') + '\n')
  return [out, new IOResult()]
}

export const TRELLO_DIRNAME = command({
  name: 'dirname',
  resource: ResourceName.TRELLO,
  spec: specOf('dirname'),
  fn: dirnameCommand,
})
