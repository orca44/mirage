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
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { writeBytes as sshWrite } from '../../../core/ssh/write.ts'
import { exists as sshExists } from '../../../core/ssh/exists.ts'
import type { SSHAccessor } from '../../../accessor/ssh.ts'

const ENC = new TextEncoder()

async function touchCommand(
  accessor: SSHAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('touch: missing operand\n') })]
  }
  const createOnly = opts.flags.c === true
  for (const p of paths) {
    if (createOnly) continue
    if (!(await sshExists(accessor, p))) {
      await sshWrite(accessor, p, new Uint8Array(0))
    }
  }
  return [null, new IOResult()]
}

export const SSH_TOUCH = command({
  name: 'touch',
  resource: ResourceName.SSH,
  spec: specOf('touch'),
  fn: touchCommand,
  write: true,
})
