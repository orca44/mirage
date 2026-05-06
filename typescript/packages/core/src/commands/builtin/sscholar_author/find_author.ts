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
import { searchAuthors } from '../../../core/sscholar/author_client.ts'
import { type ByteSource, IOResult } from '../../../io/types.ts'
import { type PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { CommandSpec, Operand, OperandKind, Option } from '../../spec/types.ts'
import { metadataProvision } from './_provision.ts'

const ENC = new TextEncoder()

const FIND_AUTHOR_SPEC = new CommandSpec({
  options: [
    new Option({ short: '-n', valueKind: OperandKind.TEXT }),
    new Option({ short: '-l', long: '--limit', valueKind: OperandKind.TEXT }),
  ],
  positional: [new Operand({ kind: OperandKind.TEXT })],
  rest: new Operand({ kind: OperandKind.PATH }),
})

async function findAuthorCommand(
  accessor: SSCholarAccessor,
  _paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const query = texts[0] ?? ''
  if (query === '') {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('find-author: missing query\n') })]
  }
  const limitFlag = typeof opts.flags.l === 'string' ? opts.flags.l : null
  const nFlag = typeof opts.flags.n === 'string' ? opts.flags.n : null
  const limit =
    limitFlag !== null
      ? Number.parseInt(limitFlag, 10)
      : nFlag !== null
        ? Number.parseInt(nFlag, 10)
        : accessor.config.defaultSearchLimit

  const result = await searchAuthors(accessor, query, limit)
  const prefix = opts.mountPrefix ?? ''
  const lines: string[] = []
  for (const author of result.data) {
    const path = `${prefix}/${author.authorId}`
    const meta = `papers=${String(author.paperCount ?? '?')}\tcitations=${String(author.citationCount ?? '?')}\thIndex=${String(author.hIndex ?? '?')}`
    lines.push(`${path}\t${author.name}\t${meta}`)
  }
  const out: ByteSource = ENC.encode(lines.join('\n') + (lines.length > 0 ? '\n' : ''))
  return [out, new IOResult()]
}

export const SSCHOLAR_AUTHOR_FIND = command({
  name: 'find-author',
  resource: ResourceName.SSCHOLAR_AUTHOR,
  spec: FIND_AUTHOR_SPEC,
  fn: findAuthorCommand,
  provision: metadataProvision,
})
