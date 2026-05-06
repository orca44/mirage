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
import { formatSegment, parseSegment, sanitizeTitle, stripDashes } from './pathing.ts'

describe('sanitizeTitle', () => {
  it('passes through normal titles', () => {
    expect(sanitizeTitle('Hello World')).toBe('Hello World')
  })
  it('replaces slashes with hyphens', () => {
    expect(sanitizeTitle('a/b/c')).toBe('a-b-c')
  })
  it('trims whitespace', () => {
    expect(sanitizeTitle('  trim  ')).toBe('trim')
  })
  it('returns "untitled" for empty input', () => {
    expect(sanitizeTitle('')).toBe('untitled')
  })
})

describe('stripDashes', () => {
  it('strips dashes from a uuid-like string', () => {
    expect(stripDashes('a-b-c-d-e')).toBe('abcde')
  })
  it('strips all dashes', () => {
    expect(stripDashes('aaa-bbb-ccc-ddd-eee')).toBe('aaabbbcccdddeee')
  })
})

describe('formatSegment', () => {
  it('joins title and id with double underscore', () => {
    expect(formatSegment({ id: 'abc123def4567890123456789012345a', title: 'My Page' })).toBe(
      'My Page__abc123def4567890123456789012345a',
    )
  })
})

describe('parseSegment', () => {
  it('splits into title and id', () => {
    expect(parseSegment('My Page__abc123def4567890123456789012345a')).toEqual({
      title: 'My Page',
      id: 'abc123def4567890123456789012345a',
    })
  })
  it('splits on the LAST __ where suffix matches the 32-hex id', () => {
    expect(parseSegment('Page__with__multiple__sep__abc123def4567890123456789012345a')).toEqual({
      title: 'Page__with__multiple__sep',
      id: 'abc123def4567890123456789012345a',
    })
  })
  it('throws on segment without an id', () => {
    expect(() => parseSegment('no-id')).toThrow(/invalid notion segment/)
  })
  it('throws when suffix is not a 32-hex id', () => {
    expect(() => parseSegment('Page__not-a-valid-id')).toThrow(/invalid notion segment/)
  })
})

describe('formatSegment / parseSegment round-trip', () => {
  it('round-trips a normal title', () => {
    const page = { id: 'abc123def4567890123456789012345a', title: 'My Page' }
    expect(parseSegment(formatSegment(page))).toEqual(page)
  })
  it('round-trips a title containing double underscore', () => {
    const page = { id: 'abc123def4567890123456789012345a', title: 'a__b' }
    expect(parseSegment(formatSegment(page))).toEqual(page)
  })
  it('normalizes an uppercase id to lowercase', () => {
    expect(
      parseSegment(formatSegment({ id: 'ABC123DEF4567890123456789012345A', title: 'X' })),
    ).toEqual({ id: 'abc123def4567890123456789012345a', title: 'X' })
  })
  it('parses a segment with empty title prefix', () => {
    expect(parseSegment('__abc123def4567890123456789012345a')).toEqual({
      title: '',
      id: 'abc123def4567890123456789012345a',
    })
  })
})
