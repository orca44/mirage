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

export interface SlackMessage {
  ts: string
  user?: string
  text?: string
  thread_ts?: string
  [key: string]: unknown
}

const encoder = new TextEncoder()

function dayBoundsUtc(dateStr: string): { oldest: string; latest: string } {
  const parts = dateStr.split('-').map((s) => Number.parseInt(s, 10))
  const y = parts[0]
  const m = parts[1]
  const d = parts[2]
  if (
    y === undefined ||
    m === undefined ||
    d === undefined ||
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d)
  ) {
    throw new Error(`Invalid date_str: ${dateStr}`)
  }
  const start = Date.UTC(y, m - 1, d, 0, 0, 0) / 1000
  const end = Date.UTC(y, m - 1, d, 23, 59, 59) / 1000
  return { oldest: String(start), latest: String(end) }
}

export async function getHistoryJsonl(
  accessor: SlackAccessor,
  channelId: string,
  dateStr: string,
): Promise<Uint8Array> {
  const { oldest, latest } = dayBoundsUtc(dateStr)
  const messages: SlackMessage[] = []
  let cursor: string | undefined
  for (;;) {
    const params: Record<string, string> = {
      channel: channelId,
      oldest,
      latest,
      limit: '200',
      inclusive: 'true',
    }
    if (cursor !== undefined && cursor !== '') params.cursor = cursor
    const data = await accessor.transport.call('conversations.history', params)
    const page = (data.messages as SlackMessage[] | undefined) ?? []
    messages.push(...page)
    const hasMore = data.has_more === true
    if (!hasMore) break
    const meta = data.response_metadata as { next_cursor?: string } | undefined
    cursor = meta?.next_cursor
    if (cursor === undefined || cursor === '') break
  }
  messages.sort((a, b) => Number.parseFloat(a.ts) - Number.parseFloat(b.ts))
  if (messages.length === 0) return new Uint8Array(0)
  const lines = messages.map((m) => JSON.stringify(m))
  return encoder.encode(lines.join('\n') + '\n')
}

export async function getThreadJsonl(
  accessor: SlackAccessor,
  channelId: string,
  threadTs: string,
): Promise<SlackMessage[]> {
  const replies: SlackMessage[] = []
  let cursor: string | undefined
  for (;;) {
    const params: Record<string, string> = {
      channel: channelId,
      ts: threadTs,
      limit: '200',
    }
    if (cursor !== undefined && cursor !== '') params.cursor = cursor
    const data = await accessor.transport.call('conversations.replies', params)
    const page = (data.messages as SlackMessage[] | undefined) ?? []
    replies.push(...page)
    const hasMore = data.has_more === true
    if (!hasMore) break
    const meta = data.response_metadata as { next_cursor?: string } | undefined
    cursor = meta?.next_cursor
    if (cursor === undefined || cursor === '') break
  }
  return replies
}
