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

import type { SlackAccessor } from '../../accessor/slack.ts'
import type { IndexEntry } from '../../cache/index/config.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { PathSpec } from '../../types.ts'
import { listChannels, listDms, type SlackChannel } from './channels.ts'
import { SlackIndexEntry } from './entry.ts'
import { listUsers } from './users.ts'

export async function latestMessageTs(
  accessor: SlackAccessor,
  channelId: string,
): Promise<number | null> {
  const data = await accessor.transport.call('conversations.history', {
    channel: channelId,
    limit: '1',
  })
  const messages = (data.messages as { ts?: string }[] | undefined) ?? []
  if (messages.length === 0) return null
  return Number.parseFloat(messages[0]?.ts ?? '0')
}

export function dateRange(latestTs: number, created: number, maxDays = 90): string[] {
  const endMs = Math.floor(latestTs * 1000)
  const startMs = Math.floor(created * 1000)
  const endDate = new Date(endMs)
  const startDate = new Date(startMs)
  const endUtc = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  let startUtc = Date.UTC(
    startDate.getUTCFullYear(),
    startDate.getUTCMonth(),
    startDate.getUTCDate(),
  )
  const dayMs = 86_400_000
  const diffDays = Math.floor((endUtc - startUtc) / dayMs)
  if (diffDays > maxDays) {
    startUtc = endUtc - (maxDays - 1) * dayMs
  }
  const dates: string[] = []
  let cursor = endUtc
  while (cursor >= startUtc) {
    const d = new Date(cursor)
    const yyyy = d.getUTCFullYear().toString().padStart(4, '0')
    const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0')
    const dd = d.getUTCDate().toString().padStart(2, '0')
    dates.push(`${yyyy}-${mm}-${dd}`)
    cursor -= dayMs
  }
  return dates
}

function enoent(path: string): Error {
  const e = new Error(`ENOENT: ${path}`) as Error & { code: string }
  e.code = 'ENOENT'
  return e
}

export async function readdir(
  accessor: SlackAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): Promise<string[]> {
  const prefix = path.prefix
  let p = path.pattern !== null ? path.directory : path.original
  if (prefix !== '' && p.startsWith(prefix)) {
    p = p.slice(prefix.length) || '/'
  }
  const key = p.replace(/^\/+|\/+$/g, '')
  const virtualKey = key !== '' ? `${prefix}/${key}` : prefix !== '' ? prefix : '/'

  if (key === '') {
    return [`${prefix}/channels`, `${prefix}/dms`, `${prefix}/users`]
  }

  if (key === 'channels') {
    if (index !== undefined) {
      const listing = await index.listDir(virtualKey)
      if (listing.entries !== undefined && listing.entries !== null) {
        return listing.entries
      }
    }
    const channels = await listChannels(accessor)
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    for (const ch of channels) {
      const entry = SlackIndexEntry.channel(ch)
      entries.push([entry.vfsName, entry])
      names.push(`${prefix}/channels/${entry.vfsName}`)
    }
    if (index !== undefined) {
      await index.setDir(virtualKey, entries)
    }
    return names
  }

  if (key === 'dms') {
    if (index !== undefined) {
      const listing = await index.listDir(virtualKey)
      if (listing.entries !== undefined && listing.entries !== null) {
        return listing.entries
      }
    }
    const dms = await listDms(accessor)
    const users = await listUsers(accessor)
    const userMap: Record<string, string> = {}
    for (const u of users) userMap[u.id] = u.name ?? u.id
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    for (const dm of dms) {
      const entry = SlackIndexEntry.dm(dm, userMap)
      entries.push([entry.vfsName, entry])
      names.push(`${prefix}/dms/${entry.vfsName}`)
    }
    if (index !== undefined) {
      await index.setDir(virtualKey, entries)
    }
    return names
  }

  if (key === 'users') {
    if (index !== undefined) {
      const listing = await index.listDir(virtualKey)
      if (listing.entries !== undefined && listing.entries !== null) {
        return listing.entries
      }
    }
    const users = await listUsers(accessor)
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    for (const u of users) {
      const entry = SlackIndexEntry.user(u)
      entries.push([entry.vfsName, entry])
      names.push(`${prefix}/users/${entry.vfsName}`)
    }
    if (index !== undefined) {
      await index.setDir(virtualKey, entries)
    }
    return names
  }

  const parts = key.split('/')
  if (parts.length === 2 && (parts[0] === 'channels' || parts[0] === 'dms')) {
    if (index === undefined) {
      throw enoent(p)
    }
    let lookup = await index.get(virtualKey)
    if (lookup.entry === undefined || lookup.entry === null) {
      const parentPath = `${prefix}/${parts[0]}`
      const parent = new PathSpec({
        original: parentPath,
        directory: parentPath,
        prefix,
      })
      await readdir(accessor, parent, index)
      lookup = await index.get(virtualKey)
    }
    if (lookup.entry === undefined || lookup.entry === null) {
      throw enoent(p)
    }
    const listing = await index.listDir(virtualKey)
    if (listing.entries !== undefined && listing.entries !== null) {
      return listing.entries
    }
    const created = Number.parseInt(lookup.entry.remoteTime || '0', 10) || 0
    const latestTs = await latestMessageTs(accessor, lookup.entry.id)
    let dates: string[]
    if (latestTs !== null && latestTs !== 0 && created !== 0) {
      dates = dateRange(latestTs, created)
    } else if (latestTs !== null && latestTs !== 0) {
      dates = dateRange(latestTs, Math.floor(latestTs))
    } else {
      dates = []
    }
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    for (const d of dates) {
      const entry = SlackIndexEntry.history(lookup.entry.id, d)
      entries.push([entry.vfsName, entry])
      names.push(`${prefix}/${key}/${entry.vfsName}`)
    }
    await index.setDir(virtualKey, entries)
    return names
  }

  return []
}

export type { SlackChannel }
