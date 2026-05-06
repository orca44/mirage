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

import { SlackAccessor, type SlackResourceLike } from '../../../accessor/slack.ts'
import { IndexEntry } from '../../../cache/index/config.ts'
import type { RAMIndexCacheStore } from '../../../cache/index/ram.ts'
import type { SlackResponse, SlackTransport } from '../../../core/slack/_client.ts'
import type { Resource } from '../../../resource/base.ts'

export interface FakeCall {
  endpoint: string
  params?: Record<string, string>
  body?: unknown
}

export type Responder = (endpoint: string, params?: Record<string, string>) => SlackResponse

export class FakeSlackTransport implements SlackTransport {
  public readonly calls: FakeCall[] = []
  constructor(private readonly responder: Responder = () => ({ ok: true })) {}
  call(endpoint: string, params?: Record<string, string>, body?: unknown): Promise<SlackResponse> {
    this.calls.push({
      endpoint,
      ...(params !== undefined ? { params } : {}),
      ...(body !== undefined ? { body } : {}),
    })
    return Promise.resolve(this.responder(endpoint, params))
  }
}

export function makeFakeResource(transport: SlackTransport): SlackResourceLike {
  const accessor = new SlackAccessor(transport)
  const resource: Resource & { accessor: SlackAccessor } = {
    kind: 'slack',
    accessor,
    open: () => Promise.resolve(),
    close: () => Promise.resolve(),
  }
  return resource as SlackResourceLike
}

export interface SeededIndex {
  index: RAMIndexCacheStore
  prefix: string
}

export async function seedChannel(
  index: RAMIndexCacheStore,
  prefix: string,
  channelDirname: string,
  channelId: string,
  options: { dates?: string[]; remoteTime?: string } = {},
): Promise<void> {
  const channelsKey = `${prefix}/channels`
  await index.setDir(channelsKey, [
    [
      channelDirname,
      new IndexEntry({
        id: channelId,
        name: channelDirname.split('__')[0] ?? channelDirname,
        resourceType: 'slack/channel',
        vfsName: channelDirname,
        remoteTime: options.remoteTime ?? '0',
      }),
    ],
  ])
  const dates = options.dates
  if (dates !== undefined) {
    const childKey = `${prefix}/channels/${channelDirname}`
    const entries: [string, IndexEntry][] = dates.map((d) => [
      `${d}.jsonl`,
      new IndexEntry({
        id: `${channelId}:${d}`,
        name: d,
        resourceType: 'slack/history',
        vfsName: `${d}.jsonl`,
      }),
    ])
    await index.setDir(childKey, entries)
  }
}

export async function seedUser(
  index: RAMIndexCacheStore,
  prefix: string,
  filename: string,
  userId: string,
): Promise<void> {
  const usersKey = `${prefix}/users`
  await index.setDir(usersKey, [
    [
      filename,
      new IndexEntry({
        id: userId,
        name: filename.split('__')[0] ?? filename,
        resourceType: 'slack/user',
        vfsName: filename,
      }),
    ],
  ])
}
