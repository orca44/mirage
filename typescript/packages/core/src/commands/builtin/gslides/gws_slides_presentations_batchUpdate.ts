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

import type { GoogleApiAccessor } from '../../../accessor/google_api.ts'
import { batchUpdate } from '../../../core/gslides/update.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { CommandSpec, Operand, OperandKind, Option } from '../../spec/types.ts'

const ENC = new TextEncoder()

const SPEC = new CommandSpec({
  options: [
    new Option({ long: '--params', valueKind: OperandKind.TEXT }),
    new Option({ long: '--json', valueKind: OperandKind.TEXT }),
  ],
  rest: new Operand({ kind: OperandKind.PATH }),
})

async function gwsSlidesBatchUpdateCommand(
  accessor: GoogleApiAccessor,
  _paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const paramsStr = typeof opts.flags.params === 'string' ? opts.flags.params : ''
  const jsonStr = typeof opts.flags.json === 'string' ? opts.flags.json : ''
  if (paramsStr === '') {
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode('--params is required\n') })]
  }
  if (jsonStr === '') {
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode('--json is required\n') })]
  }
  let params: { presentationId?: string }
  try {
    params = JSON.parse(paramsStr) as typeof params
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode(`Invalid JSON: ${msg}\n`) })]
  }
  const presId = params.presentationId ?? ''
  if (presId === '') {
    return [
      null,
      new IOResult({ exitCode: 2, stderr: ENC.encode('--params must contain presentationId\n') }),
    ]
  }
  const result = await batchUpdate(accessor.tokenManager, presId, jsonStr)
  const out: ByteSource = ENC.encode(JSON.stringify(result))
  return [out, new IOResult()]
}

export const GSLIDES_GWS_BATCH_UPDATE = command({
  name: 'gws-slides-presentations-batchUpdate',
  resource: [ResourceName.GSLIDES, ResourceName.GDRIVE],
  spec: SPEC,
  fn: gwsSlidesBatchUpdateCommand,
})
