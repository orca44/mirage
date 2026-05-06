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
import { channelDirname, guildDirname } from './entry.ts'
import type { DiscordScope } from './scope.ts'

const PAGE_SIZE = 25

export type DiscordSearchMessage = Record<string, unknown> & { id?: string }

export async function searchGuild(
  accessor: DiscordAccessor,
  guildId: string,
  query: string,
  channelId?: string,
  limit = 100,
): Promise<DiscordSearchMessage[]> {
  const messages: DiscordSearchMessage[] = []
  let offset = 0
  while (offset < limit) {
    const params: Record<string, string | number> = { content: query, offset }
    if (channelId !== undefined && channelId !== '') params.channel_id = channelId
    const data = await accessor.transport.call('GET', `/guilds/${guildId}/messages/search`, params)
    if (typeof data !== 'object' || data === null || Array.isArray(data)) break
    const dict = data as { total_results?: number; messages?: DiscordSearchMessage[][] }
    const total = dict.total_results ?? 0
    const hits = dict.messages ?? []
    if (hits.length === 0) break
    let stop = false
    for (const context of hits) {
      if (context.length > 0 && context[0] !== undefined) messages.push(context[0])
      if (messages.length >= limit) {
        stop = true
        break
      }
    }
    offset += PAGE_SIZE
    if (stop || offset >= total || messages.length >= limit) break
  }
  messages.sort((a, b) => {
    const ai = BigInt(a.id ?? '0')
    const bi = BigInt(b.id ?? '0')
    return ai < bi ? -1 : ai > bi ? 1 : 0
  })
  return messages.slice(0, limit)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function formatGrepResults(
  messages: readonly DiscordSearchMessage[],
  scope: DiscordScope,
  prefix: string,
  channelNames: ReadonlyMap<string, string> = new Map(),
): string[] {
  const guildId = scope.guildId ?? ''
  const guildVfs = guildDirname({
    id: guildId,
    ...(scope.guildName !== undefined ? { name: scope.guildName } : {}),
  })
  const lines: string[] = []
  for (const msg of messages) {
    const ts = asString(msg.timestamp).slice(0, 10)
    const chId = asString(msg.channel_id)
    const chName = channelNames.get(chId) ?? scope.channelName ?? ''
    const chVfs = channelDirname({ id: chId, ...(chName !== '' ? { name: chName } : {}) })
    const author = (msg.author as { username?: string } | undefined)?.username ?? '?'
    const content = asString(msg.content).replace(/\n/g, ' ')
    lines.push(`${prefix}/${guildVfs}/channels/${chVfs}/${ts}.jsonl:[${author}] ${content}`)
  }
  return lines
}
