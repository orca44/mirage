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
import { createSpreadsheet } from '../../../core/gsheets/create.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { CommandSpec, Operand, OperandKind, Option } from '../../spec/types.ts'

const ENC = new TextEncoder()

const SPEC = new CommandSpec({
  options: [new Option({ long: '--json', valueKind: OperandKind.TEXT })],
  rest: new Operand({ kind: OperandKind.PATH }),
})

async function gwsSheetsCreateCommand(
  accessor: GoogleApiAccessor,
  _paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const jsonStr = typeof opts.flags.json === 'string' ? opts.flags.json : ''
  if (jsonStr === '') {
    return [
      null,
      new IOResult({
        exitCode: 2,
        stderr: ENC.encode(
          'Usage: gws-sheets-spreadsheets-create --json \'{"properties": {"title": "..."}}\'\n',
        ),
      }),
    ]
  }
  let body: { properties?: { title?: string } }
  try {
    body = JSON.parse(jsonStr) as typeof body
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 2, stderr: ENC.encode(`Invalid JSON: ${msg}\n`) })]
  }
  const title = body.properties?.title ?? ''
  if (title === '') {
    return [
      null,
      new IOResult({ exitCode: 2, stderr: ENC.encode('JSON must contain properties.title\n') }),
    ]
  }
  const result = await createSpreadsheet(accessor.tokenManager, title)
  const out: ByteSource = ENC.encode(JSON.stringify(result))
  return [out, new IOResult()]
}

export const GSHEETS_GWS_CREATE = command({
  name: 'gws-sheets-spreadsheets-create',
  resource: [ResourceName.GSHEETS, ResourceName.GDRIVE],
  spec: SPEC,
  fn: gwsSheetsCreateCommand,
  write: true,
})
