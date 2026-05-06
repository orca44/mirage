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

export interface DiscordMember {
  user?: { id: string; username?: string }
  [key: string]: unknown
}

export async function listMembers(
  accessor: DiscordAccessor,
  guildId: string,
  limit = 200,
): Promise<DiscordMember[]> {
  const out = await accessor.transport.call('GET', `/guilds/${guildId}/members`, { limit })
  return Array.isArray(out) ? (out as DiscordMember[]) : []
}

export async function searchMembers(
  accessor: DiscordAccessor,
  guildId: string,
  query: string,
  limit = 100,
): Promise<DiscordMember[]> {
  const out = await accessor.transport.call('GET', `/guilds/${guildId}/members/search`, {
    query,
    limit,
  })
  return Array.isArray(out) ? (out as DiscordMember[]) : []
}
