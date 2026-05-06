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
import { fetchRows } from '../../../core/postgres/_client.ts'
import { resolveGlob } from '../../../core/postgres/glob.ts'
import { read as postgresRead } from '../../../core/postgres/read.ts'
import { detectScope } from '../../../core/postgres/scope.ts'
import { type ByteSource, IOResult } from '../../../io/types.ts'
import { type PathSpec, ResourceName } from '../../../types.ts'
import { encodeBase64 } from '../../../utils/base64.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'
import { fileReadProvision } from './_provision.ts'

const ENC = new TextEncoder()

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return encodeBase64(value)
  return value
}

function headBytes(data: Uint8Array, lines: number, bytesMode: number | null): Uint8Array {
  if (bytesMode !== null) {
    return data.slice(0, bytesMode)
  }
  let count = 0
  let end = data.byteLength
  for (let i = 0; i < data.byteLength; i++) {
    if (data[i] === 0x0a) {
      count += 1
      if (count >= lines) {
        end = i
        break
      }
    }
  }
  return data.slice(0, end)
}

async function headCommand(
  accessor: PostgresAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nRaw = typeof opts.flags.n === 'string' ? opts.flags.n : null
  const cRaw = typeof opts.flags.c === 'string' ? opts.flags.c : null
  const lines = nRaw !== null ? Number.parseInt(nRaw, 10) : 10
  const bytesMode = cRaw !== null ? Number.parseInt(cRaw, 10) : null

  if (paths.length > 0) {
    const first = paths[0]
    if (first === undefined) return [null, new IOResult()]
    const scope = detectScope(first)
    if (scope.level === 'entity_rows' && bytesMode === null) {
      const limit = Math.min(lines, accessor.config.defaultRowLimit)
      const rows = await fetchRows(accessor, scope.schema, scope.entity, {
        limit,
        offset: 0,
      })
      if (rows.length === 0) {
        return [headBytes(new Uint8Array(0), lines, null), new IOResult()]
      }
      const jsonl = rows.map((r) => JSON.stringify(r, jsonReplacer)).join('\n') + '\n'
      return [headBytes(ENC.encode(jsonl), lines, null), new IOResult()]
    }
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const target = resolved[0]
    if (target === undefined) return [null, new IOResult()]
    const data = await postgresRead(accessor, target, opts.index ?? undefined)
    const out: ByteSource = headBytes(data, lines, bytesMode)
    return [out, new IOResult()]
  }

  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('head: missing operand\n') })]
  }
  return [headBytes(raw, lines, bytesMode), new IOResult()]
}

export const POSTGRES_HEAD = command({
  name: 'head',
  resource: ResourceName.POSTGRES,
  spec: specOf('head'),
  fn: headCommand,
  provision: fileReadProvision,
})
