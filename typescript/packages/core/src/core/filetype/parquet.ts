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

import { parquetMetadata, parquetReadObjects } from 'hyparquet'

const ENC = new TextEncoder()
const MAX_PREVIEW_ROWS = 20

interface SchemaField {
  name: string
  type?: string
  num_children?: number
  repetition_type?: string
}

interface ParquetMetadata {
  num_rows: number | bigint
  row_groups: { num_rows: number | bigint; total_byte_size?: number | bigint }[]
  schema: SchemaField[]
  version?: number
  created_by?: string
}

function toArrayBuffer(raw: Uint8Array): ArrayBuffer {
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
}

function asNumber(v: number | bigint): number {
  return typeof v === 'bigint' ? Number(v) : v
}

function fieldColumns(schema: readonly SchemaField[]): SchemaField[] {
  // First element is root; rest are leaf columns (simplified — no nested schemas).
  return schema.slice(1)
}

function renderSchema(schema: readonly SchemaField[]): string[] {
  const lines = ['## Schema']
  for (const field of fieldColumns(schema)) {
    lines.push(`  ${field.name}: ${field.type ?? 'UNKNOWN'}`)
  }
  return lines
}

function renderTable(
  rows: readonly Record<string, unknown>[],
  label: string,
  count: number,
): string[] {
  const lines = [`## ${label} (${String(count)} rows)`, '']
  if (rows.length === 0) {
    lines.push('(empty)')
    lines.push('')
    return lines
  }
  const cols = Object.keys(rows[0] ?? {})
  const widths: Record<string, number> = {}
  for (const c of cols) widths[c] = c.length
  const rendered: string[][] = []
  for (const row of rows) {
    const cells = cols.map((c) => formatCell(row[c]))
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i] ?? ''
      const cell = cells[i] ?? ''
      widths[col] = Math.max(widths[col] ?? 0, cell.length)
    }
    rendered.push(cells)
  }
  lines.push(cols.map((c) => c.padStart(widths[c] ?? 0)).join(' '))
  for (const cells of rendered) {
    lines.push(
      cells
        .map((cell, i) => {
          const col = cols[i] ?? ''
          return cell.padStart(widths[col] ?? 0)
        })
        .join(' '),
    )
  }
  lines.push('')
  return lines
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'bigint') return String(v)
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  if (v instanceof Uint8Array) return `<${String(v.byteLength)}B>`
  return JSON.stringify(v)
}

function readMeta(raw: Uint8Array): ParquetMetadata {
  return parquetMetadata(toArrayBuffer(raw)) as unknown as ParquetMetadata
}

async function readRows(
  raw: Uint8Array,
  rowStart = 0,
  rowEnd?: number,
): Promise<Record<string, unknown>[]> {
  const ab = toArrayBuffer(raw)
  const options: Record<string, unknown> = { file: ab }
  if (rowStart > 0) options.rowStart = rowStart
  if (rowEnd !== undefined) options.rowEnd = rowEnd
  const rows = (await parquetReadObjects(options as never)) as Record<string, unknown>[]
  return rows
}

export function describe(raw: Uint8Array): string {
  const meta = readMeta(raw)
  const fields = fieldColumns(meta.schema)
  const cols = fields.map((f) => `${f.name}: ${f.type ?? 'UNKNOWN'}`).join(', ')
  return `parquet, ${String(asNumber(meta.num_rows))} rows, ${String(fields.length)} columns (${cols})`
}

export async function cat(raw: Uint8Array, maxRows = MAX_PREVIEW_ROWS): Promise<Uint8Array> {
  const meta = readMeta(raw)
  const numRows = asNumber(meta.num_rows)
  const previewCount = Math.min(numRows, maxRows)
  const rows = previewCount > 0 ? await readRows(raw, 0, previewCount) : []
  const schema = meta.schema
  const lines = [
    `# Rows: ${String(numRows)}, Columns: ${String(fieldColumns(schema).length)}`,
    '',
    ...renderSchema(schema),
    '',
    ...renderTable(rows, 'Preview', previewCount),
  ]
  return ENC.encode(lines.join('\n'))
}

export async function head(raw: Uint8Array, n = 10): Promise<Uint8Array> {
  const meta = readMeta(raw)
  const numRows = asNumber(meta.num_rows)
  const rowsNeeded = Math.min(n, numRows)
  const rows = rowsNeeded > 0 ? await readRows(raw, 0, rowsNeeded) : []
  const schema = meta.schema
  const lines = [
    `# Rows: ${String(numRows)}, Columns: ${String(fieldColumns(schema).length)}`,
    '',
    ...renderSchema(schema),
    '',
    ...renderTable(rows, `First ${String(rowsNeeded)}`, rowsNeeded),
  ]
  return ENC.encode(lines.join('\n'))
}

export async function tail(raw: Uint8Array, n = 10): Promise<Uint8Array> {
  const meta = readMeta(raw)
  const numRows = asNumber(meta.num_rows)
  const rowsNeeded = Math.min(n, numRows)
  const start = Math.max(0, numRows - rowsNeeded)
  const rows = rowsNeeded > 0 ? await readRows(raw, start, numRows) : []
  const schema = meta.schema
  const lines = [
    `# Rows: ${String(numRows)}, Columns: ${String(fieldColumns(schema).length)}`,
    '',
    ...renderSchema(schema),
    '',
    ...renderTable(rows, `Last ${String(rowsNeeded)}`, rowsNeeded),
  ]
  return ENC.encode(lines.join('\n'))
}

export function ls(
  raw: Uint8Array,
  meta: { size: number; modified: string | null; name: string },
): Uint8Array {
  const pq = readMeta(raw)
  const rows = asNumber(pq.num_rows)
  const cols = fieldColumns(pq.schema).length
  const line = `parquet\t${String(meta.size)}\t${String(rows)} rows\t${String(cols)} cols\t${meta.modified ?? ''}\t${meta.name}`
  return ENC.encode(line)
}

export function lsFallback(meta: {
  size: number
  modified: string | null
  name: string
}): Uint8Array {
  return ENC.encode(`parquet\t${String(meta.size)}\t\t\t${meta.modified ?? ''}\t${meta.name}`)
}

export function wc(raw: Uint8Array): number {
  return asNumber(readMeta(raw).num_rows)
}

export function stat(raw: Uint8Array): Uint8Array {
  const meta = readMeta(raw)
  const schema = meta.schema
  const lines = [
    '# Parquet file',
    `rows: ${String(asNumber(meta.num_rows))}`,
    `columns: ${String(fieldColumns(schema).length)}`,
    `row_groups: ${String(meta.row_groups.length)}`,
    meta.version !== undefined ? `format_version: ${String(meta.version)}` : '',
    meta.created_by !== undefined ? `created_by: ${meta.created_by}` : '',
    '',
    ...renderSchema(schema),
    '',
  ]
  for (let i = 0; i < meta.row_groups.length; i++) {
    const rg = meta.row_groups[i]
    if (rg === undefined) continue
    lines.push(`## Row group ${String(i)}`)
    lines.push(`  rows: ${String(asNumber(rg.num_rows))}`)
    if (rg.total_byte_size !== undefined) {
      lines.push(`  total_byte_size: ${String(asNumber(rg.total_byte_size))}`)
    }
  }
  lines.push('')
  return ENC.encode(lines.join('\n'))
}

function toCsv(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0] ?? {})
  const lines = [cols.join(',')]
  for (const row of rows) {
    lines.push(cols.map((c) => csvEscape(row[c])).join(','))
  }
  return lines.join('\n') + '\n'
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'bigint' ? String(v) : typeof v === 'string' ? v : JSON.stringify(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function grep(
  raw: Uint8Array,
  pattern: string,
  ignoreCase = false,
): Promise<Uint8Array> {
  const re = new RegExp(pattern, ignoreCase ? 'i' : '')
  const rows = await readRows(raw)
  const matched = rows.filter((row) =>
    Object.values(row).some((v) => typeof v === 'string' && re.test(v)),
  )
  return ENC.encode(toCsv(matched))
}

export async function cut(raw: Uint8Array, columns: readonly string[]): Promise<Uint8Array> {
  const meta = readMeta(raw)
  const schemaNames = fieldColumns(meta.schema).map((f) => f.name)
  for (const col of columns) {
    if (!schemaNames.includes(col)) throw new Error(`column not found: ${col}`)
  }
  const rows = await readRows(raw)
  const projected = rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const c of columns) out[c] = row[c]
    return out
  })
  return ENC.encode(toCsv(projected))
}
