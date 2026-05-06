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
import { resolveNotionGlob, type NotionGlobAccessor } from './glob.ts'

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

function makeAccessor(transport: NotionTransport): NotionGlobAccessor {
  return { transport }
}

const TOP1_ID_DASHED = 'aaaa1111-2222-3333-4444-555566667777'
const TOP1_ID = 'aaaa1111222233334444555566667777'
const TOP2_ID_DASHED = 'bbbb2222-3333-4444-5555-666677778888'
const TOP2_ID = 'bbbb2222333344445555666677778888'
const OTHER_ID_DASHED = 'eeee3333-4444-5555-6666-777788889999'
const SUB1_ID_DASHED = 'cccc1111-2222-3333-4444-555566667777'
const SUB1_ID = 'cccc1111222233334444555566667777'
const SUB2_ID_DASHED = 'dddd2222-3333-4444-5555-666677778888'
const SUB2_ID = 'dddd2222333344445555666677778888'
const PARENT_ID = 'aaaa1111222233334444555566667777'

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

describe('resolveNotionGlob', () => {
  it('passes a resolved PathSpec through unchanged', async () => {
    const transport = new FakeTransport()
    const resolved = new PathSpec({
      original: `/Page__${TOP1_ID}/`,
      directory: `/Page__${TOP1_ID}/`,
      resolved: true,
      prefix: '',
    })
    const out = await resolveNotionGlob(makeAccessor(transport), [resolved])
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(resolved)
    expect(transport.invocations).toHaveLength(0)
  })

  it('passes an unresolved PathSpec without a pattern through unchanged', async () => {
    const transport = new FakeTransport()
    const spec = new PathSpec({
      original: `/Page__${TOP1_ID}/`,
      directory: `/Page__${TOP1_ID}/`,
      pattern: null,
      resolved: false,
      prefix: '',
    })
    const out = await resolveNotionGlob(makeAccessor(transport), [spec])
    expect(out).toHaveLength(1)
    expect(out[0]).toBe(spec)
    expect(transport.invocations).toHaveLength(0)
  })

  it('matches root segments by glob pattern', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-post-search', {
      results: [
        topPage(TOP1_ID_DASHED, 'Top1'),
        topPage(TOP2_ID_DASHED, 'Top2'),
        topPage(OTHER_ID_DASHED, 'Other'),
      ],
      has_more: false,
      next_cursor: null,
    })
    const spec = new PathSpec({
      original: '/Top*',
      directory: '/',
      pattern: 'Top*',
      resolved: false,
      prefix: '',
    })
    const out = await resolveNotionGlob(makeAccessor(transport), [spec])
    const originals = out.map((p) => p.original).sort()
    expect(originals).toEqual([`/Top1__${TOP1_ID}`, `/Top2__${TOP2_ID}`])
    for (const p of out) expect(p.prefix).toBe('')
  })

  it('matches subtree segments by glob pattern', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-retrieve-block-children', {
      results: [
        { id: SUB1_ID_DASHED, type: 'child_page', child_page: { title: 'SubA' } },
        { id: SUB2_ID_DASHED, type: 'child_page', child_page: { title: 'SubB' } },
        { id: OTHER_ID_DASHED, type: 'child_page', child_page: { title: 'Other' } },
      ],
      has_more: false,
      next_cursor: null,
    })
    const dir = `/Top1__${PARENT_ID}/`
    const spec = new PathSpec({
      original: `${dir}Sub*`,
      directory: dir,
      pattern: 'Sub*',
      resolved: false,
      prefix: '',
    })
    const out = await resolveNotionGlob(makeAccessor(transport), [spec])
    const originals = out.map((p) => p.original).sort()
    expect(originals).toEqual([
      `/Top1__${PARENT_ID}/SubA__${SUB1_ID}`,
      `/Top1__${PARENT_ID}/SubB__${SUB2_ID}`,
    ])
  })

  it('returns an empty array when the pattern matches nothing', async () => {
    const transport = new FakeTransport()
    transport.enqueue('API-post-search', {
      results: [topPage(TOP1_ID_DASHED, 'Top1'), topPage(TOP2_ID_DASHED, 'Top2')],
      has_more: false,
      next_cursor: null,
    })
    const spec = new PathSpec({
      original: '/NoSuchPrefix*',
      directory: '/',
      pattern: 'NoSuchPrefix*',
      resolved: false,
      prefix: '',
    })
    const out = await resolveNotionGlob(makeAccessor(transport), [spec])
    expect(out).toEqual([])
  })
})
