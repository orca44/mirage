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

import { FileStat, FileType, PathSpec } from '../../types.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { sha256Hex } from '../../utils/hash.ts'
import type { PostgresAccessor } from '../../accessor/postgres.ts'
import { estimatedRowCount, fetchColumns, tableSizeBytes } from './_client.ts'
import { detectScope } from './scope.ts'

export async function stat(
  accessor: PostgresAccessor,
  path: PathSpec | string,
  _index?: IndexCacheStore,
): Promise<FileStat> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const prefix = spec.prefix
  let raw = spec.original
  if (prefix !== '' && raw.startsWith(prefix)) {
    raw = raw.slice(prefix.length) || '/'
  }
  const scope = detectScope(new PathSpec({ original: raw, directory: raw, prefix }))

  if (scope.level === 'root') {
    return new FileStat({ name: '/', type: FileType.DIRECTORY })
  }
  if (scope.level === 'database_json') {
    return new FileStat({ name: 'database.json', type: FileType.JSON })
  }
  if (scope.level === 'schema') {
    return new FileStat({
      name: scope.schema,
      type: FileType.DIRECTORY,
      extra: { schema: scope.schema },
    })
  }
  if (scope.level === 'kind') {
    return new FileStat({
      name: scope.kind,
      type: FileType.DIRECTORY,
      extra: { schema: scope.schema, kind: scope.kind },
    })
  }
  if (scope.level === 'entity') {
    return new FileStat({
      name: scope.entity,
      type: FileType.DIRECTORY,
      extra: { schema: scope.schema, kind: scope.kind, name: scope.entity },
    })
  }
  if (scope.level === 'entity_schema') {
    return new FileStat({
      name: 'schema.json',
      type: FileType.JSON,
      extra: { schema: scope.schema, kind: scope.kind, name: scope.entity },
    })
  }
  if (scope.level === 'entity_rows') {
    return rowsStat(accessor, scope.schema, scope.kind, scope.entity)
  }
  const err = new Error(raw) as Error & { code?: string }
  err.code = 'ENOENT'
  throw err
}

async function rowsStat(
  accessor: PostgresAccessor,
  schema: string,
  kind: string,
  entity: string,
): Promise<FileStat> {
  const cols = await fetchColumns(accessor, schema, entity)
  const rows = await estimatedRowCount(accessor, schema, entity)
  const size = await tableSizeBytes(accessor, schema, entity)
  const fingerprint = await sha256Hex(
    new TextEncoder().encode(JSON.stringify({ columns: cols, rows })),
  )
  return new FileStat({
    name: 'rows.jsonl',
    type: FileType.TEXT,
    size,
    fingerprint,
    extra: {
      schema,
      kind,
      name: entity,
      row_count: rows,
      size_bytes: size,
    },
  })
}
