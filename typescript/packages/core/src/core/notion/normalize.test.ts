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
import {
  extractIdNoDashes,
  extractTitle,
  normalizePage,
  pageSegmentName,
  toJsonBytes,
} from './normalize.ts'

describe('extractTitle', () => {
  it('joins title.title plain_text fragments', () => {
    const page = {
      properties: {
        title: {
          title: [{ plain_text: 'Hello' }, { plain_text: ' World' }],
        },
      },
    }
    expect(extractTitle(page)).toBe('Hello World')
  })

  it('falls back to properties.Name.title for database rows', () => {
    const page = {
      properties: {
        Name: {
          title: [{ plain_text: 'Row A' }],
        },
      },
    }
    expect(extractTitle(page)).toBe('Row A')
  })

  it('returns "untitled" when properties is empty', () => {
    expect(extractTitle({ properties: {} })).toBe('untitled')
  })

  it('returns "untitled" when properties is missing', () => {
    expect(extractTitle({})).toBe('untitled')
  })
})

describe('extractIdNoDashes', () => {
  it('strips dashes from a UUID-formatted id', () => {
    expect(extractIdNoDashes({ id: '2c4e9c3a-1234-5678-90ab-cdef01234567' })).toBe(
      '2c4e9c3a1234567890abcdef01234567',
    )
  })

  it('lowercases an already 32-hex id', () => {
    expect(extractIdNoDashes({ id: 'ABC123DEF4567890123456789012345A' })).toBe(
      'abc123def4567890123456789012345a',
    )
  })

  it('throws when the id is not a 32-hex value', () => {
    expect(() => extractIdNoDashes({ id: 'not-a-uuid' })).toThrow('notion page missing id')
  })

  it('throws when the page has no id at all', () => {
    expect(() => extractIdNoDashes({})).toThrow('notion page missing id')
  })
})

describe('pageSegmentName', () => {
  it('returns title__id with dashes stripped from id', () => {
    const page = {
      id: '2c4e9c3a-1234-5678-90ab-cdef01234567',
      properties: { title: { title: [{ plain_text: 'Hi' }] } },
    }
    expect(pageSegmentName(page)).toBe('Hi__2c4e9c3a1234567890abcdef01234567')
  })
})

describe('normalizePage', () => {
  it('builds the JSON-shaped record from a representative page', () => {
    const page = {
      id: '2c4e9c3a-1234-5678-90ab-cdef01234567',
      url: 'https://notion.so/Hello-2c4e9c3a1234567890abcdef01234567',
      created_time: '2025-01-01T00:00:00.000Z',
      last_edited_time: '2025-02-01T00:00:00.000Z',
      archived: false,
      parent: { type: 'workspace', workspace: true },
      properties: {
        title: { title: [{ plain_text: 'Hello' }] },
      },
    }
    const blocks = [
      { object: 'block', id: 'b1', type: 'paragraph' },
      { object: 'block', id: 'b2', type: 'heading_1' },
    ]
    expect(normalizePage(page, blocks)).toEqual({
      id: '2c4e9c3a1234567890abcdef01234567',
      title: 'Hello',
      url: 'https://notion.so/Hello-2c4e9c3a1234567890abcdef01234567',
      created_time: '2025-01-01T00:00:00.000Z',
      last_edited_time: '2025-02-01T00:00:00.000Z',
      archived: false,
      parent: { type: 'workspace', workspace: true },
      properties: { title: { title: [{ plain_text: 'Hello' }] } },
      blocks,
    })
  })

  it('fills nullable fields with null when missing', () => {
    const page = {
      id: '2c4e9c3a-1234-5678-90ab-cdef01234567',
    }
    const result = normalizePage(page, [])
    expect(result.url).toBeNull()
    expect(result.created_time).toBeNull()
    expect(result.last_edited_time).toBeNull()
    expect(result.archived).toBeNull()
    expect(result.parent).toEqual({})
    expect(result.properties).toEqual({})
    expect(result.title).toBe('untitled')
    expect(result.blocks).toEqual([])
  })

  it('passes blocks through unchanged', () => {
    const page = { id: '2c4e9c3a-1234-5678-90ab-cdef01234567' }
    const blocks = [{ object: 'block', id: 'b1' }]
    expect(normalizePage(page, blocks).blocks).toBe(blocks as unknown as typeof blocks)
  })
})

describe('toJsonBytes', () => {
  it('encodes JSON with two-space indent', () => {
    const bytes = toJsonBytes({ a: 1 })
    const decoded = new TextDecoder().decode(bytes)
    expect(decoded).toBe('{\n  "a": 1\n}')
  })
})
