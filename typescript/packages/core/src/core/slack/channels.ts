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

export interface SlackChannel {
  id: string
  name?: string
  user?: string
  is_archived?: boolean
  created?: number
  [key: string]: unknown
}

export interface ListChannelsOptions {
  types?: string
  limit?: number
}

export async function listChannels(
  accessor: SlackAccessor,
  options: ListChannelsOptions = {},
): Promise<SlackChannel[]> {
  const types = options.types ?? 'public_channel,private_channel'
  const limit = options.limit ?? 200
  const channels: SlackChannel[] = []
  let cursor: string | undefined
  for (;;) {
    const params: Record<string, string> = {
      types,
      limit: String(limit),
      exclude_archived: 'true',
    }
    if (cursor !== undefined && cursor !== '') params.cursor = cursor
    const data = await accessor.transport.call('conversations.list', params)
    const page = (data.channels as SlackChannel[] | undefined) ?? []
    channels.push(...page)
    const meta = data.response_metadata as { next_cursor?: string } | undefined
    cursor = meta?.next_cursor
    if (cursor === undefined || cursor === '') break
  }
  return channels
}

export function listDms(
  accessor: SlackAccessor,
  options: { limit?: number } = {},
): Promise<SlackChannel[]> {
  return listChannels(accessor, { types: 'im,mpim', limit: options.limit ?? 200 })
}
