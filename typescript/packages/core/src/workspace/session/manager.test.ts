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
import { DEFAULT_SESSION_ID } from '../../types.ts'
import { SessionManager } from './manager.ts'

describe('SessionManager', () => {
  it('seeds the default session on construction', () => {
    const m = new SessionManager(DEFAULT_SESSION_ID)
    expect(m.defaultId).toBe(DEFAULT_SESSION_ID)
    expect(m.get(DEFAULT_SESSION_ID).sessionId).toBe(DEFAULT_SESSION_ID)
    expect(m.list()).toHaveLength(1)
  })

  it('exposes cwd and env for the default session', () => {
    const m = new SessionManager('def')
    m.cwd = '/data'
    m.env = { K: 'V' }
    expect(m.cwd).toBe('/data')
    expect(m.env.K).toBe('V')
    expect(m.get('def').cwd).toBe('/data')
  })

  it('create adds a new session', () => {
    const m = new SessionManager('def')
    const s = m.create('sub')
    expect(s.sessionId).toBe('sub')
    expect(
      m
        .list()
        .map((x) => x.sessionId)
        .sort(),
    ).toEqual(['def', 'sub'])
  })

  it('create throws on duplicate', () => {
    const m = new SessionManager('def')
    m.create('sub')
    expect(() => m.create('sub')).toThrow(/already exists/)
  })

  it('get throws on unknown', () => {
    const m = new SessionManager('def')
    expect(() => m.get('nope')).toThrow(/unknown session/)
  })

  it('close removes a non-default session', async () => {
    const m = new SessionManager('def')
    m.create('sub')
    await m.close('sub')
    expect(m.list().map((x) => x.sessionId)).toEqual(['def'])
  })

  it('close throws on the default session', async () => {
    const m = new SessionManager('def')
    await expect(m.close('def')).rejects.toThrow(/Cannot close the default session/)
  })

  it('closeAll keeps default but drops others', async () => {
    const m = new SessionManager('def')
    m.create('a')
    m.create('b')
    await m.closeAll()
    expect(m.list().map((x) => x.sessionId)).toEqual(['def'])
  })
})
