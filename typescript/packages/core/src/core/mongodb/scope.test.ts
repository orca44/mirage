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

describe('detectScope (multi-db)', () => {
  it('detects root from "/"', () => {
    const s = detectScope(ps('/'))
    expect(s.level).toBe('root')
    expect(s.resourcePath).toBe('/')
  })

  it('detects root from empty string', () => {
    expect(detectScope(ps('')).level).toBe('root')
  })

  it('detects database level for /<db>', () => {
    const s = detectScope(ps('/app'))
    expect(s.level).toBe('database')
    expect(s.database).toBe('app')
  })

  it('detects database level with trailing slash', () => {
    const s = detectScope(ps('/app/'))
    expect(s.level).toBe('database')
    expect(s.database).toBe('app')
  })

  it('detects file level for /<db>/<col>.jsonl', () => {
    const s = detectScope(ps('/app/users.jsonl'))
    expect(s.level).toBe('file')
    expect(s.database).toBe('app')
    expect(s.collection).toBe('users')
  })

  it('returns root for too-deep paths', () => {
    expect(detectScope(ps('/app/users/extra')).level).toBe('root')
  })
})

describe('detectScope (single-db mode)', () => {
  it('treats "/" as the database', () => {
    const s = detectScope(ps('/'), { singleDb: true, singleDbName: 'app' })
    expect(s.level).toBe('database')
    expect(s.database).toBe('app')
  })

  it('treats /<col>.jsonl as a file', () => {
    const s = detectScope(ps('/users.jsonl'), { singleDb: true, singleDbName: 'app' })
    expect(s.level).toBe('file')
    expect(s.database).toBe('app')
    expect(s.collection).toBe('users')
  })

  it('treats /<x> as still the database', () => {
    const s = detectScope(ps('/sub'), { singleDb: true, singleDbName: 'app' })
    expect(s.level).toBe('database')
    expect(s.database).toBe('app')
  })
})

describe('detectScope (path prefix)', () => {
  it('strips mount prefix before detection', () => {
    const path = new PathSpec({
      original: '/mongo/app/users.jsonl',
      directory: '/mongo/app/',
      prefix: '/mongo',
    })
    const s = detectScope(path)
    expect(s.level).toBe('file')
    expect(s.database).toBe('app')
    expect(s.collection).toBe('users')
  })
})
