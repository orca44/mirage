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
import { Session } from './session.ts'

describe('Session', () => {
  it('defaults cwd=/ and empty env', () => {
    const s = new Session({ sessionId: 'x' })
    expect(s.cwd).toBe('/')
    expect(s.env).toEqual({})
    expect(s.functions).toEqual({})
    expect(s.lastExitCode).toBe(0)
  })

  it('cwd and env are mutable', () => {
    const s = new Session({ sessionId: 'x' })
    s.cwd = '/data'
    s.env = { FOO: 'bar' }
    expect(s.cwd).toBe('/data')
    expect(s.env.FOO).toBe('bar')
  })

  it('toJSON includes only the serializable fields', () => {
    const s = new Session({ sessionId: 'x', cwd: '/a', env: { K: 'V' } })
    const json = s.toJSON()
    expect(json).toEqual({
      sessionId: 'x',
      cwd: '/a',
      env: { K: 'V' },
      createdAt: s.createdAt,
    })
    expect('functions' in json).toBe(false)
    expect('lastExitCode' in json).toBe(false)
  })

  it('fromJSON round-trips', () => {
    const original = new Session({ sessionId: 'x', cwd: '/a', env: { K: 'V' } })
    const restored = Session.fromJSON(
      original.toJSON() as {
        sessionId: string
        cwd: string
        env: Record<string, string>
        createdAt: number
      },
    )
    expect(restored.sessionId).toBe('x')
    expect(restored.cwd).toBe('/a')
    expect(restored.env).toEqual({ K: 'V' })
  })
})
