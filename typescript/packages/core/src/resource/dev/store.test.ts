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
import { DevFiles, DevStore } from './store.ts'

describe('DevFiles', () => {
  it('reports has() true only for null/zero (with or without leading slash)', () => {
    const f = new DevFiles()
    expect(f.has('/null')).toBe(true)
    expect(f.has('null')).toBe(true)
    expect(f.has('/zero')).toBe(true)
    expect(f.has('zero')).toBe(true)
    expect(f.has('/other')).toBe(false)
  })

  it('returns empty bytes for /null', () => {
    const f = new DevFiles()
    const v = f.get('/null')
    expect(v).toBeInstanceOf(Uint8Array)
    expect(v?.byteLength).toBe(0)
  })

  it('returns 1 MiB of zeros for /zero', () => {
    const f = new DevFiles()
    const v = f.get('/zero')
    expect(v).toBeInstanceOf(Uint8Array)
    expect(v?.byteLength).toBe(1 << 20)
    expect(v?.every((b) => b === 0)).toBe(true)
  })

  it('returns undefined for unknown keys', () => {
    const f = new DevFiles()
    expect(f.get('/missing')).toBeUndefined()
  })

  it('silently drops set/delete/clear', () => {
    const f = new DevFiles()
    f.set('/null', new TextEncoder().encode('overwrite'))
    expect(f.get('/null')?.byteLength).toBe(0)
    expect(f.delete('/null')).toBe(false)
    expect(f.has('/null')).toBe(true)
    f.clear()
    expect(f.has('/null')).toBe(true)
    expect(f.has('/zero')).toBe(true)
  })

  it('iterates as [/null, /zero]', () => {
    const f = new DevFiles()
    expect([...f.keys()]).toEqual(['/null', '/zero'])
    expect(f.size).toBe(2)
  })
})

describe('DevStore', () => {
  it('starts with the synthetic files and root dir', () => {
    const s = new DevStore()
    expect(s.files.size).toBe(2)
    expect(s.dirs.has('/')).toBe(true)
    expect(s.modified.size).toBe(0)
  })
})
