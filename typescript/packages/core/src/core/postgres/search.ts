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

import type { PostgresAccessor } from '../../accessor/postgres.ts'
import { listMatviews, listSchemas, listTables, listViews, quoteIdent } from './_client.ts'

const TEXT_TYPES = [
  'text',
  'character varying',
  'character',
  'name',
  'uuid',
  'json',
  'jsonb',
] as const

export interface EntityMatches {
  schema: string
  kind: string
  entity: string
  rows: Record<string, unknown>[]
}

async function textColumns(
  accessor: PostgresAccessor,
  schema: string,
  name: string,
): Promise<string[]> {
  const result = await accessor.store.query<{ column_name: string }>(
    'SELECT column_name FROM information_schema.columns ' +
      'WHERE table_schema = $1 AND table_name = $2 ' +
      'AND data_type = ANY($3::text[]) ' +
      'ORDER BY ordinal_position',
    [schema, name, [...TEXT_TYPES]],
  )
  return result.rows.map((r) => r.column_name)
}

export async function searchEntity(
  accessor: PostgresAccessor,
  schema: string,
  _kind: string,
  entity: string,
  pattern: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cols = await textColumns(accessor, schema, entity)
  if (cols.length === 0) return []
  const where = cols.map((c) => `${quoteIdent(c)}::text ILIKE $1`).join(' OR ')
  const sql =
    `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(entity)} ` + `WHERE ${where} LIMIT $2`
  const result = await accessor.store.query(sql, [`%${pattern}%`, limit])
  return result.rows
}

export async function searchKind(
  accessor: PostgresAccessor,
  schema: string,
  kind: string,
  pattern: string,
  limit: number,
): Promise<EntityMatches[]> {
  let names: string[]
  if (kind === 'tables') {
    names = await listTables(accessor, schema)
  } else {
    const views = await listViews(accessor, schema)
    const mviews = await listMatviews(accessor, schema)
    names = [...new Set([...views, ...mviews])].sort()
  }
  const out: EntityMatches[] = []
  for (const n of names) {
    const rows = await searchEntity(accessor, schema, kind, n, pattern, limit)
    if (rows.length > 0) out.push({ schema, kind, entity: n, rows })
  }
  return out
}

export async function searchSchema(
  accessor: PostgresAccessor,
  schema: string,
  pattern: string,
  limit: number,
): Promise<EntityMatches[]> {
  const out: EntityMatches[] = []
  for (const kind of ['tables', 'views'] as const) {
    out.push(...(await searchKind(accessor, schema, kind, pattern, limit)))
  }
  return out
}

export async function searchDatabase(
  accessor: PostgresAccessor,
  pattern: string,
  limit: number,
): Promise<EntityMatches[]> {
  const schemas = await listSchemas(accessor, accessor.config.schemas)
  const out: EntityMatches[] = []
  for (const s of schemas) {
    out.push(...(await searchSchema(accessor, s, pattern, limit)))
  }
  return out
}

export function formatGrepResults(results: readonly EntityMatches[]): string[] {
  const lines: string[] = []
  for (const { schema, kind, entity, rows } of results) {
    for (const r of rows) {
      lines.push(`${schema}/${kind}/${entity}/rows.jsonl:${JSON.stringify(r)}`)
    }
  }
  return lines
}
