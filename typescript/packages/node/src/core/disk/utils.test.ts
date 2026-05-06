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

import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { basename, norm, parent, resolveSafe } from './utils.ts'

describe('resolveSafe', () => {
  it('joins root with virtual path', () => {
    expect(resolveSafe('/tmp/r', '/a/b.txt')).toBe(resolve('/tmp/r', 'a/b.txt'))
  })
  it('strips leading slash from virtual', () => {
    expect(resolveSafe('/tmp/r', '/x')).toBe(resolve('/tmp/r', 'x'))
  })
  it('returns root when virtual is empty/slash', () => {
    expect(resolveSafe('/tmp/r', '/')).toBe(resolve('/tmp/r'))
  })
  it('throws when virtual escapes the root via ..', () => {
    expect(() => resolveSafe('/tmp/r', '/../escaped')).toThrow(/escapes root/)
  })
  it('allows nested paths within root', () => {
    expect(resolveSafe('/tmp/r', '/a/b/c')).toBe(resolve('/tmp/r', 'a/b/c'))
  })
  it('uses platform separator', () => {
    const res = resolveSafe('/tmp/r', '/a/b')
    expect(res.endsWith(`a${sep}b`)).toBe(true)
  })
})

describe('norm', () => {
  it('always returns leading slash', () => {
    expect(norm('foo')).toBe('/foo')
  })
  it('strips trailing slashes', () => {
    expect(norm('/foo///')).toBe('/foo')
  })
  it('handles empty string', () => {
    expect(norm('')).toBe('/')
  })
  it('handles root', () => {
    expect(norm('/')).toBe('/')
  })
})

describe('parent', () => {
  it('returns the parent directory', () => {
    expect(parent('/a/b/c')).toBe('/a/b')
  })
  it('returns / for top-level paths', () => {
    expect(parent('/x')).toBe('/')
  })
  it('returns / for /', () => {
    expect(parent('/')).toBe('/')
  })
})

describe('basename', () => {
  it('returns the last segment', () => {
    expect(basename('/a/b/c')).toBe('c')
  })
  it('returns / for /', () => {
    expect(basename('/')).toBe('/')
  })
  it('handles single-segment paths', () => {
    expect(basename('/x')).toBe('x')
  })
})
