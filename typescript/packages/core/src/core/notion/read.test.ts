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
import { PathSpec } from '../../types.ts'
import type { NotionTransport } from './_client.ts'
import { read, type NotionReadAccessor } from './read.ts'

class FakeTransport implements NotionTransport {
  public readonly invocations: { name: string; args: Record<string, unknown> }[] = []
  private readonly responses = new Map<string, Record<string, unknown>[]>()

  enqueue(toolName: string, response: Record<string, unknown>): void {
    const list = this.responses.get(toolName)
    if (list === undefined) {
      this.responses.set(toolName, [response])
    } else {
      list.push(response)
    }
  }

  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.invocations.push({ name, args })
    const list = this.responses.get(name) ?? []
    if (list.length === 0) return Promise.reject(new Error(`no canned response for ${name}`))
    const response = list.shift()
    if (response === undefined) return Promise.reject(new Error(`no canned response for ${name}`))
    return Promise.resolve(response)
  }
}

function makeAccessor(transport: NotionTransport): NotionReadAccessor {
  return { transport }
}

function spec(original: string, prefix = ''): PathSpec {
  return new PathSpec({ original, directory: original, prefix })
}

const PAGE_ID_DASHED = 'aaaa1111-2222-3333-4444-555566667777'
const PAGE_ID = 'aaaa1111222233334444555566667777'
const CHILD_ID_DASHED = 'cccc1111-2222-3333-4444-555566667777'
const CHILD_ID = 'cccc1111222233334444555566667777'

function pageBody(id: string, title: string): Record<string, unknown> {
  return {
    id,
    object: 'page',
    url: 'https://notion.so/Some-Page',
    created_time: '2024-01-01T00:00:00Z',
    last_edited_time: '2024-01-02T00:00:00Z',
    archived: false,
    parent: { type: 'workspace', workspace: true },
    properties: {
      title: { title: [{ plain_text: title }] },
    },
  }
}

function decodeJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes))
}

describe('notion read', () => {
  it('returns JSON bytes containing the normalized page and its blocks', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-retrieve-a-page', pageBody(PAGE_ID_DASHED, 'My Page'))
    transport.enqueue('API-retrieve-block-children', {
      results: [
        { id: 'block-1', type: 'paragraph' },
        {
          id: CHILD_ID_DASHED,
          type: 'child_page',
          child_page: { title: 'Child' },
        },
      ],
      has_more: false,
      next_cursor: null,
    })
    const path = `/My Page__${PAGE_ID}/page.json`
    const bytes = await read(makeAccessor(transport), spec(path), undefined)
    expect(bytes).toBeInstanceOf(Uint8Array)
    const decoded = decodeJson(bytes) as Record<string, unknown>
    expect(decoded.id).toBe(PAGE_ID)
    expect(decoded.title).toBe('My Page')
    expect(decoded.last_edited_time).toBe('2024-01-02T00:00:00Z')
    expect(decoded.created_time).toBe('2024-01-01T00:00:00Z')
    expect(decoded.archived).toBe(false)
    expect(Array.isArray(decoded.blocks)).toBe(true)
    const blocks = decoded.blocks as { id: string }[]
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.id).toBe('block-1')
    expect(blocks[1]?.id).toBe(CHILD_ID_DASHED)
    const calls = transport.invocations
    expect(calls).toHaveLength(2)
    const pageCall = calls.find((c) => c.name === 'API-retrieve-a-page')
    expect(pageCall?.args).toEqual({ page_id: PAGE_ID })
    const blockCall = calls.find((c) => c.name === 'API-retrieve-block-children')
    expect(blockCall?.args).toEqual({ block_id: PAGE_ID, page_size: 100 })
  })

  it('honors a path prefix', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-retrieve-a-page', pageBody(PAGE_ID_DASHED, 'Prefixed'))
    transport.enqueue('API-retrieve-block-children', {
      results: [],
      has_more: false,
      next_cursor: null,
    })
    const original = `/notion/Prefixed__${PAGE_ID}/page.json`
    const bytes = await read(
      makeAccessor(transport),
      new PathSpec({ original, directory: original, prefix: '/notion' }),
      undefined,
    )
    const decoded = decodeJson(bytes) as Record<string, unknown>
    expect(decoded.id).toBe(PAGE_ID)
    expect(decoded.title).toBe('Prefixed')
    expect(decoded.blocks).toEqual([])
  })

  it('throws ENOENT when the path does not end in page.json', async () => {
    const transport = new FakeTransport()
    const cases = [
      `/My Page__${PAGE_ID}/`,
      `/My Page__${PAGE_ID}/foo.txt`,
      `/My Page__${PAGE_ID}/SubPage__${CHILD_ID}/`,
    ]
    for (const original of cases) {
      let captured: unknown = null
      try {
        await read(makeAccessor(transport), spec(original), undefined)
      } catch (err) {
        captured = err
      }
      expect(captured).toBeInstanceOf(Error)
      expect((captured as { code?: string }).code).toBe('ENOENT')
    }
    expect(transport.invocations).toHaveLength(0)
  })

  it('throws ENOENT when reading /page.json with no parent segment', async () => {
    const transport = new FakeTransport()
    let captured: unknown = null
    try {
      await read(makeAccessor(transport), spec('/page.json'), undefined)
    } catch (err) {
      captured = err
    }
    expect(captured).toBeInstanceOf(Error)
    expect((captured as { code?: string }).code).toBe('ENOENT')
    expect(transport.invocations).toHaveLength(0)
  })

  it('throws ENOENT when the parent segment is not a valid notion segment', async () => {
    const transport = new FakeTransport()
    let captured: unknown = null
    try {
      await read(makeAccessor(transport), spec('/no-id/page.json'), undefined)
    } catch (err) {
      captured = err
    }
    expect(captured).toBeInstanceOf(Error)
    expect((captured as { code?: string }).code).toBe('ENOENT')
    expect(transport.invocations).toHaveLength(0)
  })
})
