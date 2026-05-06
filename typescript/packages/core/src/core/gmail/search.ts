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

import type { TokenManager } from '../google/_client.ts'
import { decodeBody, extractHeader, getMessageRaw, listMessages } from './messages.ts'
import { sanitize } from './readdir.ts'
import type { GmailScope } from './scope.ts'

const EXCERPT_WINDOW = 120
const EXCERPT_MAX = 240

export interface GmailSearchRow {
  id: string
  subject: string
  snippet: string
  sender: string
  date: string
  label: string
  bodyText: string
}

function extractExcerpt(text: string, pattern: string): string {
  if (text === '' || pattern === '') return ''
  const flat = text.replace(/\s+/g, ' ').trim()
  const lower = flat.toLowerCase()
  const idx = lower.indexOf(pattern.toLowerCase())
  if (idx < 0) return flat.slice(0, EXCERPT_MAX)
  const start = Math.max(0, idx - EXCERPT_WINDOW)
  const end = Math.min(flat.length, idx + pattern.length + EXCERPT_WINDOW)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < flat.length ? '...' : ''
  return `${prefix}${flat.slice(start, end)}${suffix}`
}

function buildQuery(pattern: string, labelName: string | null, dateStr: string | null): string {
  const parts: string[] = [pattern]
  if (labelName !== null && labelName !== '') parts.push(`label:${labelName}`)
  if (dateStr !== null && dateStr !== '') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
    if (m !== null) parts.push(`after:${m[1] ?? ''}/${m[2] ?? ''}/${m[3] ?? ''}`)
  }
  return parts.join(' ')
}

function dateFromInternal(internalDate: string | undefined): string {
  if (internalDate === undefined || internalDate === '') return ''
  const ts = Number.parseInt(internalDate, 10)
  if (!Number.isFinite(ts)) return ''
  const d = new Date(ts)
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0')
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = d.getUTCDate().toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export async function searchMessages(
  tokenManager: TokenManager,
  pattern: string,
  labelName: string | null = null,
  dateStr: string | null = null,
  maxResults = 50,
): Promise<GmailSearchRow[]> {
  const query = buildQuery(pattern, labelName, dateStr)
  const stubs = await listMessages(tokenManager, { query, maxResults })
  const rows: GmailSearchRow[] = []
  for (const stub of stubs) {
    const mid = stub.id
    if (mid === '') continue
    const raw = await getMessageRaw(tokenManager, mid)
    const headers = raw.payload?.headers ?? []
    const subject = extractHeader(headers, 'Subject') || 'No Subject'
    const sender = extractHeader(headers, 'From') || '?'
    const snippet = raw.snippet ?? ''
    const bodyText = decodeBody(raw.payload)
    const msgDate = dateFromInternal(raw.internalDate)
    rows.push({
      id: mid,
      subject,
      snippet,
      sender,
      date: msgDate,
      label: labelName ?? '',
      bodyText,
    })
  }
  return rows
}

export function formatGrepResults(
  rows: GmailSearchRow[],
  scope: GmailScope,
  prefix: string,
  pattern = '',
): string[] {
  const lines: string[] = []
  for (const row of rows) {
    const label = row.label !== '' ? row.label : (scope.labelName ?? 'INBOX')
    const date = row.date
    const mid = row.id
    const filename = `${sanitize(row.subject || 'No Subject')}__${mid}.gmail.json`
    const sender = row.sender !== '' ? row.sender : '?'
    const haystack = `${row.subject}\n${row.bodyText}`
    let excerpt = pattern !== '' ? extractExcerpt(haystack, pattern) : ''
    if (excerpt === '') excerpt = row.snippet.replace(/\n/g, ' ')
    const path =
      date !== '' ? `${prefix}/${label}/${date}/${filename}` : `${prefix}/${label}/${filename}`
    lines.push(`${path}:[${sender}] ${excerpt}`)
  }
  return lines
}
