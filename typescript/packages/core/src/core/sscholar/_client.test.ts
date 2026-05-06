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
import { SSCholarAccessor } from '../../accessor/sscholar.ts'
import { resolveSSCholarConfig } from '../../resource/sscholar/config.ts'
import type {
  SSCholarDriver,
  SSCholarPaper,
  SSCholarSearchOptions,
  SSCholarSearchResult,
  SSCholarSnippetSearchResult,
} from './_driver.ts'
import { read } from './read.ts'
import { readdir } from './readdir.ts'

class FakeDriver implements SSCholarDriver {
  searchCalls: SSCholarSearchOptions[] = []
  paperCalls: string[] = []

  getPaper(paperId: string): Promise<SSCholarPaper> {
    this.paperCalls.push(paperId)
    return Promise.resolve({
      paperId,
      title: 'Sample Title',
      abstract: 'Sample abstract.',
      year: 2024,
      tldr: { model: 'tldr@v2', text: 'Short summary.' },
      authors: [{ authorId: '1', name: 'Alice' }],
      fieldsOfStudy: ['Computer Science'],
    })
  }

  searchPapers(options: SSCholarSearchOptions): Promise<SSCholarSearchResult> {
    this.searchCalls.push(options)
    return Promise.resolve({
      total: 2,
      offset: 0,
      data: [
        { paperId: 'p1', title: 'Paper One', year: 2024 },
        { paperId: 'p2', title: 'Paper Two', year: 2024 },
      ],
    })
  }

  searchSnippets(_query: string, _limit?: number): Promise<SSCholarSnippetSearchResult> {
    return Promise.resolve({ data: [] })
  }

  getAuthor(authorId: string): Promise<{ authorId: string; name: string }> {
    return Promise.resolve({ authorId, name: 'Stub Author' })
  }

  getAuthorPapers(_authorId: string): Promise<{ offset: number; data: never[] }> {
    return Promise.resolve({ offset: 0, data: [] })
  }

  searchAuthors(
    _query: string,
    _limit?: number,
  ): Promise<{ total: number; offset: number; data: never[] }> {
    return Promise.resolve({ total: 0, offset: 0, data: [] })
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}

function makeAccessor(): { accessor: SSCholarAccessor; driver: FakeDriver } {
  const driver = new FakeDriver()
  const accessor = new SSCholarAccessor(driver, resolveSSCholarConfig({}))
  return { accessor, driver }
}

const DEC = new TextDecoder()

describe('sscholar core', () => {
  it('readdir / lists 23 fields', async () => {
    const { accessor } = makeAccessor()
    const entries = await readdir(accessor, '/')
    expect(entries.length).toBe(23)
    expect(entries[0]).toContain('agricultural-and-food-sciences')
  })

  it('readdir /<field>/<year>/ calls searchPapers with correct args', async () => {
    const { accessor, driver } = makeAccessor()
    const entries = await readdir(accessor, '/computer-science/2024')
    expect(entries).toEqual(['/computer-science/2024/p1', '/computer-science/2024/p2'])
    expect(driver.searchCalls.length).toBe(1)
    expect(driver.searchCalls[0]?.fieldsOfStudy).toBe('Computer Science')
    expect(driver.searchCalls[0]?.year).toBe('2024')
    expect(driver.searchCalls[0]?.sort).toBe('publicationDate:desc')
  })

  it('read meta.json returns JSON with paper metadata', async () => {
    const { accessor, driver } = makeAccessor()
    const data = await read(accessor, '/computer-science/2024/p1/meta.json')
    const json = JSON.parse(DEC.decode(data)) as { paperId: string; title: string }
    expect(json.paperId).toBe('p1')
    expect(json.title).toBe('Sample Title')
    expect(driver.paperCalls).toEqual(['p1'])
  })

  it('read tldr.txt returns the tldr text', async () => {
    const { accessor } = makeAccessor()
    const data = await read(accessor, '/computer-science/2024/p1/tldr.txt')
    expect(DEC.decode(data).trim()).toBe('Short summary.')
  })

  it('read abstract.txt returns abstract', async () => {
    const { accessor } = makeAccessor()
    const data = await read(accessor, '/computer-science/2024/p1/abstract.txt')
    expect(DEC.decode(data).trim()).toBe('Sample abstract.')
  })

  it('read on invalid path throws ENOENT', async () => {
    const { accessor } = makeAccessor()
    await expect(read(accessor, '/computer-science/2024/p1/nope.txt')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
