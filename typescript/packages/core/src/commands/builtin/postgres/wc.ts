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

import type { PostgresAccessor } from '../../../accessor/postgres.ts'
import { countRows } from '../../../core/postgres/_client.ts'
import { resolveGlob } from '../../../core/postgres/glob.ts'
import { read as postgresRead } from '../../../core/postgres/read.ts'
import { detectScope } from '../../../core/postgres/scope.ts'
import { type ByteSource, IOResult } from '../../../io/types.ts'
import { type PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { fileReadProvision } from './_provision.ts'

const ENC = new TextEncoder()

async function wcCommand(
  accessor: PostgresAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const f = opts.flags
  const lFlag = f.args_l === true
  const wFlag = f.w === true
  const cFlag = f.c === true
  const mFlag = f.m === true
  const LFlag = f.L === true

  if (wFlag || mFlag || LFlag) {
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: ENC.encode('wc: only -l and -c supported for Postgres'),
      }),
    ]
  }

  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('wc: missing operand\n') })]
  }

  const first = paths[0]
  if (first === undefined) return [null, new IOResult()]
  const scope = detectScope(first)

  if (scope.level === 'entity_rows') {
    if (cFlag) {
      const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
      const target = resolved[0]
      if (target === undefined) return [null, new IOResult()]
      const data = await postgresRead(accessor, target, opts.index ?? undefined)
      const out: ByteSource = ENC.encode(String(data.byteLength))
      return [out, new IOResult()]
    }
    if (lFlag) {
      const count = await countRows(accessor, scope.schema, scope.entity)
      return [ENC.encode(String(count)), new IOResult()]
    }
    const count = await countRows(accessor, scope.schema, scope.entity)
    return [ENC.encode(String(count)), new IOResult()]
  }

  return [
    null,
    new IOResult({
      exitCode: 1,
      stderr: ENC.encode('wc: path must target an entity rows.jsonl file'),
    }),
  ]
}

export const POSTGRES_WC = command({
  name: 'wc',
  resource: ResourceName.POSTGRES,
  spec: specOf('wc'),
  fn: wcCommand,
  provision: fileReadProvision,
})
