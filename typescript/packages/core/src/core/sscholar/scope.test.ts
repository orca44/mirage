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
import { detectScope } from './scope.ts'

function ps(p: string): PathSpec {
  return new PathSpec({ original: p, directory: p })
}

describe('sscholar detectScope', () => {
  it('detects root from "/"', () => {
    expect(detectScope(ps('/')).level).toBe('root')
  })

  it('detects field from /<field-slug>', () => {
    const s = detectScope(ps('/computer-science'))
    expect(s.level).toBe('field')
    expect(s.fieldSlug).toBe('computer-science')
    expect(s.field).toBe('Computer Science')
  })

  it('detects field with multi-word slug', () => {
    const s = detectScope(ps('/agricultural-and-food-sciences'))
    expect(s.level).toBe('field')
    expect(s.field).toBe('Agricultural and Food Sciences')
  })

  it('rejects unknown field slug', () => {
    expect(detectScope(ps('/bogus-field')).level).toBe('invalid')
  })

  it('detects year level', () => {
    const s = detectScope(ps('/computer-science/2024'))
    expect(s.level).toBe('year')
    expect(s.year).toBe('2024')
  })

  it('rejects bogus year', () => {
    expect(detectScope(ps('/computer-science/1899')).level).toBe('invalid')
  })

  it('detects paper directory level', () => {
    const s = detectScope(ps('/computer-science/2024/abc123'))
    expect(s.level).toBe('paper')
    expect(s.paperId).toBe('abc123')
  })

  it('detects file level', () => {
    const s = detectScope(ps('/computer-science/2024/abc123/meta.json'))
    expect(s.level).toBe('file')
    expect(s.filename).toBe('meta.json')
  })

  it('rejects unknown filename', () => {
    expect(detectScope(ps('/computer-science/2024/abc123/random.txt')).level).toBe('invalid')
  })

  it('rejects too-deep paths', () => {
    expect(detectScope(ps('/computer-science/2024/abc123/meta.json/extra')).level).toBe('invalid')
  })
})
