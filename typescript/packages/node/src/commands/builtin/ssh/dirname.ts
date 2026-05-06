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

function dirnameCommand(
  _accessor: Accessor,
  paths: PathSpec[],
  texts: string[],
  _opts: CommandOpts,
): CommandFnResult {
  const arg = texts[0] ?? paths[0]?.original ?? ''
  const stripped = arg.replace(/\/+$/, '')
  const idx = stripped.lastIndexOf('/')
  const dir = idx > 0 ? stripped.slice(0, idx) : idx === 0 ? '/' : '.'
  const out: ByteSource = new TextEncoder().encode(`${dir}\n`)
  return [out, new IOResult()]
}

export const SSH_DIRNAME = command({
  name: 'dirname',
  resource: ResourceName.SSH,
  spec: specOf('dirname'),
  fn: dirnameCommand,
})
