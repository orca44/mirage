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

import { describe, expect, it } from 'vitest'
import { listChannels, listDms } from './channels.ts'
import { SlackAccessor } from '../../accessor/slack.ts'
import type { SlackResponse, SlackTransport } from './_client.ts'

class FakeTransport implements SlackTransport {
  public readonly calls: { endpoint: string; params?: Record<string, string>; body?: unknown }[] =
    []
  constructor(
    private readonly responder: (call: number, params?: Record<string, string>) => SlackResponse,
  ) {}
  call(endpoint: string, params?: Record<string, string>, body?: unknown): Promise<SlackResponse> {
    this.calls.push({
      endpoint,
      ...(params !== undefined ? { params } : {}),
      ...(body !== undefined ? { body } : {}),
    })
    return Promise.resolve(this.responder(this.calls.length, params))
  }
}

describe('listChannels', () => {
  it('paginates conversations.list using response_metadata.next_cursor', async () => {
    const t = new FakeTransport((n) => {
      if (n === 1) {
        return {
          ok: true,
          channels: [{ id: 'C1', name: 'a' }],
          response_metadata: { next_cursor: 'curs2' },
        }
      }
      return {
        ok: true,
        channels: [{ id: 'C2', name: 'b' }],
        response_metadata: { next_cursor: '' },
      }
    })
    const out = await listChannels(new SlackAccessor(t))
    expect(out.map((c) => (c as { id: string }).id)).toEqual(['C1', 'C2'])
    expect(t.calls[0]?.params).toMatchObject({
      types: 'public_channel,private_channel',
      limit: '200',
      exclude_archived: 'true',
    })
    expect(t.calls[1]?.params).toMatchObject({ cursor: 'curs2' })
    expect(t.calls[0]?.endpoint).toBe('conversations.list')
  })

  it('uses custom types and limit', async () => {
    const t = new FakeTransport(() => ({
      ok: true,
      channels: [],
      response_metadata: { next_cursor: '' },
    }))
    await listChannels(new SlackAccessor(t), { types: 'public_channel', limit: 50 })
    expect(t.calls[0]?.params).toMatchObject({ types: 'public_channel', limit: '50' })
  })

  it('returns empty array when no channels', async () => {
    const t = new FakeTransport(() => ({
      ok: true,
      channels: [],
      response_metadata: { next_cursor: '' },
    }))
    const out = await listChannels(new SlackAccessor(t))
    expect(out).toEqual([])
  })
})

describe('listDms', () => {
  it('calls conversations.list with types=im,mpim', async () => {
    const t = new FakeTransport(() => ({
      ok: true,
      channels: [{ id: 'D1', user: 'U1' }],
      response_metadata: { next_cursor: '' },
    }))
    const out = await listDms(new SlackAccessor(t))
    expect(t.calls[0]?.params).toMatchObject({ types: 'im,mpim', limit: '200' })
    expect(out).toEqual([{ id: 'D1', user: 'U1' }])
  })
})
