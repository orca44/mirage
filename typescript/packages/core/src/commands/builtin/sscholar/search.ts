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
import { searchPapers } from '../../../core/sscholar/_client.ts'
import { detectScope } from '../../../core/sscholar/scope.ts'
import { type ByteSource, IOResult } from '../../../io/types.ts'
import { type PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { CommandSpec, Operand, OperandKind, Option } from '../../spec/types.ts'
import { metadataProvision } from './_provision.ts'

const ENC = new TextEncoder()

const SEARCH_SPEC = new CommandSpec({
  options: [
    new Option({ short: '-n', valueKind: OperandKind.TEXT }),
    new Option({ short: '-l', long: '--limit', valueKind: OperandKind.TEXT }),
  ],
  positional: [new Operand({ kind: OperandKind.TEXT })],
  rest: new Operand({ kind: OperandKind.PATH }),
})

async function searchCommand(
  accessor: SSCholarAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const query = texts[0] ?? ''
  if (query === '') {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('search: missing query\n') })]
  }
  const limitFlag = typeof opts.flags.l === 'string' ? opts.flags.l : null
  const nFlag = typeof opts.flags.n === 'string' ? opts.flags.n : null
  const limit =
    limitFlag !== null
      ? Number.parseInt(limitFlag, 10)
      : nFlag !== null
        ? Number.parseInt(nFlag, 10)
        : accessor.config.defaultSearchLimit

  let field: string | null = null
  let year: string | null = null
  if (paths.length > 0) {
    const first = paths[0]
    if (first !== undefined) {
      const scope = detectScope(first)
      if (scope.field !== null) field = scope.field
      if (scope.year !== null) year = scope.year
    }
  }

  const result = await searchPapers(accessor, query, field, year, limit)
  const lines: string[] = []
  const prefix = opts.mountPrefix ?? ''
  for (const paper of result.data) {
    const yr = paper.year !== undefined && paper.year !== null ? String(paper.year) : '----'
    const fos = paper.fieldsOfStudy?.[0] ?? null
    const fieldSlug =
      fos !== null
        ? fos.toLowerCase().replace(/\s+/g, '-')
        : (field?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown')
    const path = `${prefix}/${fieldSlug}/${yr}/${paper.paperId}`
    const title = (paper.title ?? '').replace(/\s+/g, ' ').slice(0, 100)
    lines.push(`${path}\t${title}`)
  }
  const out: ByteSource = ENC.encode(lines.join('\n') + (lines.length > 0 ? '\n' : ''))
  return [out, new IOResult()]
}

export const SSCHOLAR_SEARCH = command({
  name: 'search',
  resource: ResourceName.SSCHOLAR_PAPER,
  spec: SEARCH_SPEC,
  fn: searchCommand,
  provision: metadataProvision,
})
