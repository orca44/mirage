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
import type { IndexCacheStore } from '../../cache/index/store.ts'
import type { PathSpec } from '../../types.ts'
import { getHistoryJsonl } from './history.ts'
import { listMembers } from './members.ts'

const encoder = new TextEncoder()

function fileNotFound(key: string): Error {
  const e = new Error(`ENOENT: ${key}`) as Error & { code: string }
  e.code = 'ENOENT'
  return e
}

export async function read(
  accessor: DiscordAccessor,
  path: PathSpec,
  index?: IndexCacheStore,
): Promise<Uint8Array> {
  const prefix = path.prefix
  let raw = path.original
  if (prefix !== '' && raw.startsWith(prefix)) {
    raw = raw.slice(prefix.length) || '/'
  }
  const key = raw.replace(/^\/+|\/+$/g, '')
  const parts = key.split('/')
  const part0 = parts[0] ?? ''
  const part1 = parts[1] ?? ''
  const part2 = parts[2] ?? ''
  const part3 = parts[3] ?? ''

  if (parts.length === 4 && part1 === 'channels' && part3.endsWith('.jsonl')) {
    if (index === undefined) throw fileNotFound(key)
    const chKey = `${part0}/${part1}/${part2}`
    const chVirtual = `${prefix}/${chKey}`
    const chLookup = await index.get(chVirtual)
    if (chLookup.entry === undefined || chLookup.entry === null) {
      throw fileNotFound(key)
    }
    const dateStr = part3.slice(0, -'.jsonl'.length)
    return await getHistoryJsonl(accessor, chLookup.entry.id, dateStr)
  }

  if (parts.length === 3 && part1 === 'members' && part2.endsWith('.json')) {
    if (index === undefined) throw fileNotFound(key)
    const virtualKey = `${prefix}/${key}`
    const lookup = await index.get(virtualKey)
    if (lookup.entry === undefined || lookup.entry === null) {
      throw fileNotFound(key)
    }
    const guildVirtual = `${prefix}/${part0}`
    const guildLookup = await index.get(guildVirtual)
    if (guildLookup.entry === undefined || guildLookup.entry === null) {
      throw fileNotFound(key)
    }
    const members = await listMembers(accessor, guildLookup.entry.id, 200)
    for (const m of members) {
      if (m.user?.id === lookup.entry.id) {
        return encoder.encode(JSON.stringify(m))
      }
    }
    throw fileNotFound(key)
  }

  throw fileNotFound(key)
}
