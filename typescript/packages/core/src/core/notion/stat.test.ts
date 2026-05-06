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
import { IndexEntry } from '../../cache/index/config.ts'
import { RAMIndexCacheStore } from '../../cache/index/ram.ts'
import { FileType, PathSpec } from '../../types.ts'
import type { NotionTransport } from './_client.ts'
import { stat, type NotionStatAccessor } from './stat.ts'

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

function makeAccessor(transport: NotionTransport): NotionStatAccessor {
  return { transport }
}

function spec(original: string, prefix = ''): PathSpec {
  return new PathSpec({ original, directory: original, prefix })
}

const PAGE_ID_DASHED = 'aaaa1111-2222-3333-4444-555566667777'
const PAGE_ID = 'aaaa1111222233334444555566667777'

function pageBody(id: string, title: string, lastEdited: string): Record<string, unknown> {
  return {
    id,
    object: 'page',
    url: 'https://notion.so/Some-Page',
    created_time: '2024-01-01T00:00:00Z',
    last_edited_time: lastEdited,
    archived: false,
    parent: { type: 'workspace', workspace: true },
    properties: {
      title: { title: [{ plain_text: title }] },
    },
  }
}

describe('notion stat', () => {
  it('returns a directory stat for the root', async () => {
    const transport = new FakeTransport()
    const result = await stat(makeAccessor(transport), spec('/'), undefined)
    expect(result.name).toBe('/')
    expect(result.type).toBe(FileType.DIRECTORY)
    expect(result.modified).toBeNull()
    expect(result.size).toBeNull()
    expect(transport.invocations).toHaveLength(0)
  })

  it('returns directory stat for a page dir using cached remoteTime', async () => {
    const transport = new FakeTransport()
    const idx = new RAMIndexCacheStore()
    const segment = `Page__${PAGE_ID}`
    await idx.put(
      `/${segment}`,
      new IndexEntry({
        id: PAGE_ID,
        name: segment,
        resourceType: 'notion/page',
        remoteTime: '2024-01-02T00:00:00Z',
        vfsName: segment,
      }),
    )
    const result = await stat(makeAccessor(transport), spec(`/${segment}/`), idx)
    expect(result.name).toBe(segment)
    expect(result.type).toBe(FileType.DIRECTORY)
    expect(result.modified).toBe('2024-01-02T00:00:00Z')
    expect(result.size).toBeNull()
    expect(result.extra.page_id).toBe(PAGE_ID)
    expect(transport.invocations).toHaveLength(0)
  })

  it('falls back to getPage when index has no entry for the page dir', async () => {
    const transport = new FakeTransport()
    transport.enqueue(
      'API-retrieve-a-page',
      pageBody(PAGE_ID_DASHED, 'Page', '2024-03-04T00:00:00Z'),
    )
    const idx = new RAMIndexCacheStore()
    const segment = `Page__${PAGE_ID}`
    const result = await stat(makeAccessor(transport), spec(`/${segment}/`), idx)
    expect(result.type).toBe(FileType.DIRECTORY)
    expect(result.modified).toBe('2024-03-04T00:00:00Z')
    expect(result.extra.page_id).toBe(PAGE_ID)
    expect(transport.invocations).toHaveLength(1)
    expect(transport.invocations[0]?.name).toBe('API-retrieve-a-page')
    expect(transport.invocations[0]?.args).toEqual({ page_id: PAGE_ID })
  })

  it('returns json stat for page.json using cached parent remoteTime', async () => {
    const transport = new FakeTransport()
    const idx = new RAMIndexCacheStore()
    const segment = `Page__${PAGE_ID}`
    await idx.put(
      `/${segment}`,
      new IndexEntry({
        id: PAGE_ID,
        name: segment,
        resourceType: 'notion/page',
        remoteTime: '2024-05-06T00:00:00Z',
        vfsName: segment,
      }),
    )
    const result = await stat(makeAccessor(transport), spec(`/${segment}/page.json`), idx)
    expect(result.name).toBe('page.json')
    expect(result.type).toBe(FileType.JSON)
    expect(result.modified).toBe('2024-05-06T00:00:00Z')
    expect(result.size).toBeNull()
    expect(result.extra.page_id).toBe(PAGE_ID)
    expect(transport.invocations).toHaveLength(0)
  })

  it('falls back to getPage for page.json when no cache', async () => {
    const transport = new FakeTransport()
    transport.enqueue(
      'API-retrieve-a-page',
      pageBody(PAGE_ID_DASHED, 'Page', '2024-07-08T00:00:00Z'),
    )
    const segment = `Page__${PAGE_ID}`
    const result = await stat(makeAccessor(transport), spec(`/${segment}/page.json`), undefined)
    expect(result.type).toBe(FileType.JSON)
    expect(result.modified).toBe('2024-07-08T00:00:00Z')
    expect(result.extra.page_id).toBe(PAGE_ID)
    expect(transport.invocations).toHaveLength(1)
    expect(transport.invocations[0]?.args).toEqual({ page_id: PAGE_ID })
  })

  it('throws ENOENT for an invalid segment', async () => {
    const transport = new FakeTransport()
    let captured: unknown = null
    try {
      await stat(makeAccessor(transport), spec('/no-id-here/'), undefined)
    } catch (err) {
      captured = err
    }
    expect(captured).toBeInstanceOf(Error)
    expect((captured as { code?: string }).code).toBe('ENOENT')
    expect(transport.invocations).toHaveLength(0)
  })

  it('throws ENOENT for an unknown leaf inside a page dir', async () => {
    const transport = new FakeTransport()
    const segment = `Page__${PAGE_ID}`
    let captured: unknown = null
    try {
      await stat(makeAccessor(transport), spec(`/${segment}/foo.txt`), undefined)
    } catch (err) {
      captured = err
    }
    expect(captured).toBeInstanceOf(Error)
    expect((captured as { code?: string }).code).toBe('ENOENT')
    expect(transport.invocations).toHaveLength(0)
  })

  it('honors a path prefix', async () => {
    const transport = new FakeTransport()
    const idx = new RAMIndexCacheStore()
    const segment = `Page__${PAGE_ID}`
    await idx.put(
      `/notion/${segment}`,
      new IndexEntry({
        id: PAGE_ID,
        name: segment,
        resourceType: 'notion/page',
        remoteTime: '2024-09-10T00:00:00Z',
        vfsName: segment,
      }),
    )
    const original = `/notion/${segment}/`
    const result = await stat(
      makeAccessor(transport),
      new PathSpec({ original, directory: original, prefix: '/notion' }),
      idx,
    )
    expect(result.type).toBe(FileType.DIRECTORY)
    expect(result.name).toBe(segment)
    expect(result.modified).toBe('2024-09-10T00:00:00Z')
    expect(result.extra.page_id).toBe(PAGE_ID)
    expect(transport.invocations).toHaveLength(0)
  })
})
