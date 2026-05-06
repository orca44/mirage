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

import type { SSCholarAccessor } from '../../../accessor/sscholar.ts'
import { searchSnippets } from '../../../core/sscholar/_client.ts'
import { type ByteSource, IOResult } from '../../../io/types.ts'
import { type PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { metadataProvision } from './_provision.ts'

const ENC = new TextEncoder()

async function grepCommand(
  accessor: SSCholarAccessor,
  _paths: PathSpec[],
  texts: string[],
  _opts: CommandOpts,
): Promise<CommandFnResult> {
  const query = texts[0] ?? ''
  if (query === '') {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('grep: missing pattern\n') })]
  }
  const limit = accessor.config.defaultSnippetLimit
  const result = await searchSnippets(accessor, query, limit)
  const lines: string[] = []
  for (const m of result.data) {
    const id = m.paper.paperId
    const text = m.snippet.text.replace(/\s+/g, ' ').trim()
    lines.push(`${id}:\t${text}`)
  }
  const out: ByteSource = ENC.encode(lines.join('\n') + (lines.length > 0 ? '\n' : ''))
  return [out, new IOResult()]
}

export const SSCHOLAR_GREP = command({
  name: 'grep',
  resource: ResourceName.SSCHOLAR_PAPER,
  spec: specOf('grep'),
  fn: grepCommand,
  provision: metadataProvision,
})
