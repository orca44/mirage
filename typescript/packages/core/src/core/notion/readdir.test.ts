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
import { RAMIndexCacheStore } from '../../cache/index/ram.ts'
import { PathSpec } from '../../types.ts'
import type { NotionTransport } from './_client.ts'
import { readdir, type NotionReaddirAccessor } from './readdir.ts'

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

function makeAccessor(transport: NotionTransport): NotionReaddirAccessor {
  return { transport }
}

function spec(original: string, prefix = ''): PathSpec {
  return new PathSpec({ original, directory: original, prefix })
}

const TOP1_ID_DASHED = 'aaaa1111-2222-3333-4444-555566667777'
const TOP1_ID = 'aaaa1111222233334444555566667777'
const TOP2_ID_DASHED = 'bbbb2222-3333-4444-5555-666677778888'
const TOP2_ID = 'bbbb2222333344445555666677778888'
const CHILD1_ID_DASHED = 'cccc1111-2222-3333-4444-555566667777'
const CHILD1_ID = 'cccc1111222233334444555566667777'
const CHILD2_ID_DASHED = 'dddd2222-3333-4444-5555-666677778888'
const CHILD2_ID = 'dddd2222333344445555666677778888'

function topPage(id: string, title: string): Record<string, unknown> {
  return {
    id,
    object: 'page',
    parent: { type: 'workspace', workspace: true },
    last_edited_time: '2024-01-02T00:00:00Z',
    properties: {
      title: { title: [{ plain_text: title }] },
    },
  }
}

describe('notion readdir root', () => {
  it('lists top-level pages with workspace parents and prefixes names', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-post-search', {
      results: [
        topPage(TOP1_ID_DASHED, 'Top1'),
        topPage(TOP2_ID_DASHED, 'Top2'),
        {
          id: 'eeee3333-4444-5555-6666-777788889999',
          object: 'page',
          parent: { type: 'page_id', page_id: 'other' },
          properties: { title: { title: [{ plain_text: 'NestedNotShown' }] } },
        },
      ],
      has_more: false,
      next_cursor: null,
    })
    const out = await readdir(makeAccessor(transport), spec('/'), undefined)
    expect(out).toEqual([`/Top1__${TOP1_ID}`, `/Top2__${TOP2_ID}`])
  })

  it('honors prefix when listing the root', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-post-search', {
      results: [topPage(TOP1_ID_DASHED, 'Top1'), topPage(TOP2_ID_DASHED, 'Top2')],
      has_more: false,
      next_cursor: null,
    })
    const out = await readdir(
      makeAccessor(transport),
      new PathSpec({ original: '/notion', directory: '/notion', prefix: '/notion' }),
      undefined,
    )
    expect(out).toEqual([`/notion/Top1__${TOP1_ID}`, `/notion/Top2__${TOP2_ID}`])
  })

  it('returns prefixed entries from the index cache when present', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-post-search', {
      results: [topPage(TOP1_ID_DASHED, 'Top1')],
      has_more: false,
      next_cursor: null,
    })
    const idx = new RAMIndexCacheStore()
    await readdir(makeAccessor(transport), spec('/'), idx)
    expect(transport.invocations).toHaveLength(1)
    const out = await readdir(makeAccessor(transport), spec('/'), idx)
    expect([...out].sort()).toEqual([`/Top1__${TOP1_ID}`])
    expect(transport.invocations).toHaveLength(1)
  })
})

describe('notion readdir subtree', () => {
  it('lists page.json first followed by child pages, ignoring non-page blocks', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-retrieve-block-children', {
      results: [
        {
          id: CHILD1_ID_DASHED,
          type: 'child_page',
          child_page: { title: 'ChildA' },
        },
        { id: 'block-x', type: 'paragraph' },
        {
          id: CHILD2_ID_DASHED,
          type: 'child_page',
          child_page: { title: 'ChildB' },
        },
      ],
      has_more: false,
      next_cursor: null,
    })
    const dirPath = `/Top1__${TOP1_ID}`
    const out = await readdir(makeAccessor(transport), spec(dirPath), undefined)
    expect(out).toEqual([
      `${dirPath}/page.json`,
      `${dirPath}/ChildA__${CHILD1_ID}`,
      `${dirPath}/ChildB__${CHILD2_ID}`,
    ])
    expect(transport.invocations).toHaveLength(1)
    expect(transport.invocations[0]?.args).toEqual({
      block_id: TOP1_ID,
      page_size: 100,
    })
  })

  it('uses the index cache on the second call without invoking the transport', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-retrieve-block-children', {
      results: [{ id: CHILD1_ID_DASHED, type: 'child_page', child_page: { title: 'ChildA' } }],
      has_more: false,
      next_cursor: null,
    })
    const idx = new RAMIndexCacheStore()
    const dirPath = `/Top1__${TOP1_ID}`
    const first = await readdir(makeAccessor(transport), spec(dirPath), idx)
    expect(first).toEqual([`${dirPath}/page.json`, `${dirPath}/ChildA__${CHILD1_ID}`])
    expect(transport.invocations).toHaveLength(1)
    const second = await readdir(makeAccessor(transport), spec(dirPath), idx)
    expect(transport.invocations).toHaveLength(1)
    expect([...second].sort()).toEqual([...first].sort())
  })

  it('throws ENOENT when the last segment is not a valid notion segment', async () => {
    const transport = new FakeTransport()
    let captured: unknown = null
    try {
      await readdir(makeAccessor(transport), spec('/no-id-here/'), undefined)
    } catch (err) {
      captured = err
    }
    expect(captured).not.toBeNull()
    expect(captured).toBeInstanceOf(Error)
    expect((captured as { code?: string }).code).toBe('ENOENT')
    expect(transport.invocations).toHaveLength(0)
  })

  it('honors prefix when listing a subtree', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-retrieve-block-children', {
      results: [{ id: CHILD1_ID_DASHED, type: 'child_page', child_page: { title: 'ChildA' } }],
      has_more: false,
      next_cursor: null,
    })
    const dirPath = `/notion/Top1__${TOP1_ID}`
    const out = await readdir(
      makeAccessor(transport),
      new PathSpec({ original: dirPath, directory: dirPath, prefix: '/notion' }),
      undefined,
    )
    expect(out).toEqual([`${dirPath}/page.json`, `${dirPath}/ChildA__${CHILD1_ID}`])
  })
})
