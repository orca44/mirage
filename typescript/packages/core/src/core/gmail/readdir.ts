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

import type { GmailAccessor } from '../../accessor/gmail.ts'
import { IndexEntry } from '../../cache/index/config.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { PathSpec } from '../../types.ts'
import { listLabels } from './labels.ts'
import type { GmailMessageRaw } from './messages.ts'
import { extractAttachments, extractHeader, getMessageRaw, listMessages } from './messages.ts'

const TITLE_MAX = 80
const UNSAFE = /[^\w\s\-.]/g
const MULTI_UNDERSCORE = /_+/g

export function sanitize(text: string): string {
  if (text.trim() === '') return 'No_Subject'
  let cleaned = text.replace(UNSAFE, '_').replace(/ /g, '_')
  cleaned = cleaned.replace(MULTI_UNDERSCORE, '_').replace(/^_+|_+$/g, '')
  if (cleaned.length > TITLE_MAX) cleaned = `${cleaned.slice(0, TITLE_MAX - 3)}...`
  return cleaned
}

function msgFilename(subject: string, msgId: string): string {
  return `${sanitize(subject)}__${msgId}.gmail.json`
}

function dateFromInternal(internalDate: string | undefined): string {
  if (internalDate === undefined) return '1970-01-01'
  const ts = Number.parseInt(internalDate, 10)
  if (!Number.isFinite(ts)) return '1970-01-01'
  const d = new Date(ts)
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0')
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = d.getUTCDate().toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function enoent(p: string): Error {
  const e = new Error(`ENOENT: ${p}`) as Error & { code: string }
  e.code = 'ENOENT'
  return e
}

export async function readdir(
  accessor: GmailAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): Promise<string[]> {
  const prefix = path.prefix
  const raw = path.pattern !== null ? path.directory : path.original
  let p = raw
  if (prefix !== '' && p.startsWith(prefix)) p = p.slice(prefix.length) || '/'
  const key = p.replace(/^\/+|\/+$/g, '')
  const virtualKey = key !== '' ? `${prefix}/${key}` : prefix !== '' ? prefix : '/'
  const parts = key === '' ? [] : key.split('/')
  const depth = parts.length

  if (depth === 0) {
    if (index !== undefined) {
      const cached = await index.listDir(virtualKey)
      if (cached.entries !== undefined && cached.entries !== null) return cached.entries
    }
    const labels = await listLabels(accessor.tokenManager)
    const entries: [string, IndexEntry][] = []
    for (const lb of labels) {
      const name = lb.type === 'system' ? lb.id : (lb.name ?? lb.id)
      const entry = new IndexEntry({
        id: lb.id,
        name,
        resourceType: 'gmail/label',
        vfsName: name,
      })
      entries.push([name, entry])
    }
    if (index !== undefined) await index.setDir(virtualKey, entries)
    return entries.map(([name]) => `${prefix}/${name}`)
  }

  if (depth === 1) {
    const labelName = parts[0] ?? ''
    if (index !== undefined) {
      const cached = await index.listDir(virtualKey)
      if (cached.entries !== undefined && cached.entries !== null) return cached.entries
    }
    if (index === undefined) throw enoent(path.original)
    const labelKey = prefix !== '' ? `${prefix}/${labelName}` : `/${labelName}`
    let result = await index.get(labelKey)
    if (result.entry === undefined || result.entry === null) {
      try {
        const root = new PathSpec({
          original: prefix !== '' ? prefix : '/',
          directory: prefix !== '' ? prefix : '/',
          prefix,
        })
        await readdir(accessor, root, index)
        result = await index.get(labelKey)
      } catch {
        // ignore — falls through to ENOENT below
      }
    }
    if (result.entry === undefined || result.entry === null) throw enoent(path.original)
    const labelId = result.entry.id
    const msgIds = await listMessages(accessor.tokenManager, { labelId, maxResults: 50 })
    const dateGroups = new Map<string, GmailMessageRaw[]>()
    for (const m of msgIds) {
      const mid = m.id
      const rawMsg = await getMessageRaw(accessor.tokenManager, mid)
      const dateStr = dateFromInternal(rawMsg.internalDate)
      let bucket = dateGroups.get(dateStr)
      if (bucket === undefined) {
        bucket = []
        dateGroups.set(dateStr, bucket)
      }
      bucket.push(rawMsg)
    }
    const sortedDates = [...dateGroups.keys()].sort().reverse()
    const dateEntries: [string, IndexEntry][] = []
    for (const dateStr of sortedDates) {
      const dateEntry = new IndexEntry({
        id: dateStr,
        name: dateStr,
        resourceType: 'gmail/date',
        vfsName: dateStr,
      })
      dateEntries.push([dateStr, dateEntry])
      const msgEntries: [string, IndexEntry][] = []
      for (const rawMsg of dateGroups.get(dateStr) ?? []) {
        const mid = rawMsg.id ?? ''
        const headers = rawMsg.payload?.headers ?? []
        const subject = extractHeader(headers, 'Subject') || 'No Subject'
        const filename = msgFilename(subject, mid)
        const msgEntry = new IndexEntry({
          id: mid,
          name: subject,
          resourceType: 'gmail/message',
          vfsName: filename,
          size: rawMsg.sizeEstimate ?? null,
        })
        msgEntries.push([filename, msgEntry])
        const attachments = extractAttachments(rawMsg.payload)
        if (attachments.length > 0) {
          const attDirName = filename.replace('.gmail.json', '')
          const attDirEntry = new IndexEntry({
            id: mid,
            name: attDirName,
            resourceType: 'gmail/attachment_dir',
            vfsName: attDirName,
          })
          msgEntries.push([attDirName, attDirEntry])
          const attEntries: [string, IndexEntry][] = []
          for (const att of attachments) {
            const attEntry = new IndexEntry({
              id: att.attachmentId,
              name: att.filename,
              resourceType: 'gmail/attachment',
              vfsName: att.filename,
              size: att.size,
            })
            attEntries.push([att.filename, attEntry])
          }
          const attDirVKey = `${virtualKey}/${dateStr}/${attDirName}`
          await index.setDir(attDirVKey, attEntries)
        }
      }
      const dateVKey = `${virtualKey}/${dateStr}`
      await index.setDir(dateVKey, msgEntries)
    }
    await index.setDir(virtualKey, dateEntries)
    return dateEntries.map(([name]) => `${prefix}/${key}/${name}`)
  }

  if (depth === 2 || depth === 3) {
    if (index === undefined) throw enoent(path.original)
    let cached = await index.listDir(virtualKey)
    if (cached.entries !== undefined && cached.entries !== null) return cached.entries
    const labelPath = prefix !== '' ? `${prefix}/${parts[0] ?? ''}` : `/${parts[0] ?? ''}`
    const labelSpec = new PathSpec({ original: labelPath, directory: labelPath, prefix })
    await readdir(accessor, labelSpec, index)
    cached = await index.listDir(virtualKey)
    if (cached.entries !== undefined && cached.entries !== null) return cached.entries
    throw enoent(path.original)
  }

  throw enoent(path.original)
}
