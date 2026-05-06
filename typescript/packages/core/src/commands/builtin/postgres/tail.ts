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
import { countRows, fetchRows } from '../../../core/postgres/_client.ts'
import { resolveGlob } from '../../../core/postgres/glob.ts'
import { read as postgresRead } from '../../../core/postgres/read.ts'
import { detectScope } from '../../../core/postgres/scope.ts'
import { type ByteSource, IOResult } from '../../../io/types.ts'
import { type PathSpec, ResourceName } from '../../../types.ts'
import { encodeBase64 } from '../../../utils/base64.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { parseN, tailBytes } from '../tail_helper.ts'
import { readStdinAsync } from '../utils/stream.ts'
import { fileReadProvision } from './_provision.ts'

const ENC = new TextEncoder()

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return encodeBase64(value)
  return value
}

function tailResult(
  raw: Uint8Array,
  lines: number,
  plusMode: boolean,
  bytesMode: number | null,
): Uint8Array {
  if (bytesMode !== null) {
    return bytesMode === 0 ? new Uint8Array(0) : raw.slice(-bytesMode)
  }
  return tailBytes(raw, lines, null, plusMode)
}

async function tailCommand(
  accessor: PostgresAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nRaw = typeof opts.flags.n === 'string' ? opts.flags.n : null
  const cRaw = typeof opts.flags.c === 'string' ? opts.flags.c : null
  const [lines, plusMode] = parseN(nRaw)
  const bytesMode = cRaw !== null ? Number.parseInt(cRaw, 10) : null

  if (paths.length > 0) {
    const first = paths[0]
    if (first === undefined) return [null, new IOResult()]
    const scope = detectScope(first)
    if (scope.level === 'entity_rows' && bytesMode === null) {
      const limit = Math.min(lines, accessor.config.defaultRowLimit)
      const total = await countRows(accessor, scope.schema, scope.entity)
      const offset = Math.max(0, total - limit)
      const rows = await fetchRows(accessor, scope.schema, scope.entity, {
        limit,
        offset,
      })
      if (rows.length === 0) {
        return [tailResult(new Uint8Array(0), lines, plusMode, null), new IOResult()]
      }
      const jsonl = rows.map((r) => JSON.stringify(r, jsonReplacer)).join('\n') + '\n'
      return [tailResult(ENC.encode(jsonl), lines, plusMode, null), new IOResult()]
    }
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const target = resolved[0]
    if (target === undefined) return [null, new IOResult()]
    const raw = await postgresRead(accessor, target, opts.index ?? undefined)
    const out: ByteSource = tailResult(raw, lines, plusMode, bytesMode)
    return [out, new IOResult()]
  }

  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tail: missing operand\n') })]
  }
  return [tailResult(raw, lines, plusMode, bytesMode), new IOResult()]
}

export const POSTGRES_TAIL = command({
  name: 'tail',
  resource: ResourceName.POSTGRES,
  spec: specOf('tail'),
  fn: tailCommand,
  provision: fileReadProvision,
})
