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

import type { DiscordAccessor } from '../../accessor/discord.ts'
import type { IndexEntry } from '../../cache/index/config.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { PathSpec } from '../../types.ts'
import { listChannels } from './channels.ts'
import { DiscordIndexEntry } from './entry.ts'
import { listGuilds } from './guilds.ts'
import { listMembers } from './members.ts'

const DISCORD_EPOCH = 1420070400000n

export function snowflakeToDate(snowflake: string): string {
  if (snowflake === '') return ''
  const ms = (BigInt(snowflake) >> 22n) + DISCORD_EPOCH
  const d = new Date(Number(ms))
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0')
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = d.getUTCDate().toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function dateRangeDescending(endDate: string, days = 30): string[] {
  const [y, m, d] = endDate.split('-').map((n) => Number.parseInt(n, 10))
  if (y === undefined || m === undefined || d === undefined) return []
  const end = Date.UTC(y, m - 1, d)
  const dates: string[] = []
  for (let i = 0; i < days; i++) {
    const cursor = new Date(end - i * 86_400_000)
    const yy = cursor.getUTCFullYear().toString().padStart(4, '0')
    const mm = (cursor.getUTCMonth() + 1).toString().padStart(2, '0')
    const dd = cursor.getUTCDate().toString().padStart(2, '0')
    dates.push(`${yy}-${mm}-${dd}`)
  }
  return dates
}

function enoent(path: string): Error {
  const e = new Error(`ENOENT: ${path}`) as Error & { code: string }
  e.code = 'ENOENT'
  return e
}

function todayUtc(): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear().toString().padStart(4, '0')
  const mm = (now.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = now.getUTCDate().toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export async function readdir(
  accessor: DiscordAccessor,
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
    if (index !== undefined) {
      const listing = await index.listDir(virtualKey)
      if (listing.entries !== undefined && listing.entries !== null) return listing.entries
    }
    const guilds = await listGuilds(accessor)
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    for (const g of guilds) {
      const entry = DiscordIndexEntry.guild(g)
      entries.push([entry.vfsName, entry])
      names.push(`${prefix}/${entry.vfsName}`)
    }
    if (index !== undefined) await index.setDir(virtualKey, entries)
    return names
  }

  const parts = key.split('/')

  if (parts.length === 1) {
    if (index !== undefined) {
      const lookup = await index.get(virtualKey)
      if (lookup.entry === undefined || lookup.entry === null) {
        const root = new PathSpec({
          original: prefix !== '' ? prefix : '/',
          directory: prefix !== '' ? prefix : '/',
          prefix,
        })
        await readdir(accessor, root, index)
        const retry = await index.get(virtualKey)
        if (retry.entry === undefined || retry.entry === null) throw enoent(p)
      }
    }
    return [`${prefix}/${key}/channels`, `${prefix}/${key}/members`]
  }

  if (parts.length === 2 && (parts[1] === 'channels' || parts[1] === 'members')) {
    if (index === undefined) throw enoent(p)
    const listing = await index.listDir(virtualKey)
    if (listing.entries !== undefined && listing.entries !== null) return listing.entries
    const guildSeg = parts[0]
    if (guildSeg === undefined) throw enoent(p)
    const guildVirtualKey = `${prefix}/${guildSeg}`
    let guildLookup = await index.get(guildVirtualKey)
    if (guildLookup.entry === undefined || guildLookup.entry === null) {
      const root = new PathSpec({
        original: prefix !== '' ? prefix : '/',
        directory: prefix !== '' ? prefix : '/',
        prefix,
      })
      await readdir(accessor, root, index)
      guildLookup = await index.get(guildVirtualKey)
    }
    if (guildLookup.entry === undefined || guildLookup.entry === null) throw enoent(p)
    const guildId = guildLookup.entry.id

    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    if (parts[1] === 'channels') {
      const channels = await listChannels(accessor, guildId)
      for (const c of channels) {
        const base = DiscordIndexEntry.channel(c)
        const lastMsgId = typeof c.last_message_id === 'string' ? c.last_message_id : ''
        const entry = lastMsgId !== '' ? base.copyWith({ remoteTime: lastMsgId }) : base
        entries.push([entry.vfsName, entry])
        names.push(`${prefix}/${key}/${entry.vfsName}`)
      }
    } else {
      const members = await listMembers(accessor, guildId)
      for (const m of members) {
        const user = m.user
        if (user === undefined || user.id === '') continue
        const entry = DiscordIndexEntry.member({ id: user.id, name: user.username ?? '' })
        entries.push([entry.vfsName, entry])
        names.push(`${prefix}/${key}/${entry.vfsName}`)
      }
    }
    await index.setDir(virtualKey, entries)
    return names
  }

  if (parts.length === 3 && parts[1] === 'channels') {
    if (index === undefined) throw enoent(p)
    const listing = await index.listDir(virtualKey)
    if (listing.entries !== undefined && listing.entries !== null) return listing.entries
    let chLookup = await index.get(virtualKey)
    if (chLookup.entry === undefined || chLookup.entry === null) {
      const parentPath = `${prefix}/${parts.slice(0, 2).join('/')}`
      const parent = new PathSpec({
        original: parentPath,
        directory: parentPath,
        prefix,
      })
      await readdir(accessor, parent, index)
      chLookup = await index.get(virtualKey)
    }
    if (chLookup.entry === undefined || chLookup.entry === null) throw enoent(p)
    const lastMsgId = chLookup.entry.remoteTime
    const endDate = lastMsgId !== '' ? snowflakeToDate(lastMsgId) : todayUtc()
    const dates = dateRangeDescending(endDate, 30)
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    const channelDir = parts[2]
    if (channelDir === undefined) return []
    for (const d of dates) {
      const entry = DiscordIndexEntry.history(channelDir, d)
      entries.push([entry.vfsName, entry])
      names.push(`${prefix}/${key}/${entry.vfsName}`)
    }
    await index.setDir(virtualKey, entries)
    return names
  }

  return []
}
