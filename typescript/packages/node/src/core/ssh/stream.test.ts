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
import { PathSpec } from '@struktoai/mirage-core'
import { makeFakeAccessor } from './_test_utils.ts'
import { rangeRead, stream } from './stream.ts'

function spec(p: string): PathSpec {
  return PathSpec.fromStrPath(p)
}

describe('core/ssh/stream', () => {
  it('yields all bytes', async () => {
    const accessor = makeFakeAccessor({
      files: new Map([['/x', { data: new TextEncoder().encode('hello stream') }]]),
      dirs: new Map([['/', {}]]),
    })
    const chunks: Uint8Array[] = []
    for await (const c of stream(accessor, spec('/x'))) chunks.push(c)
    const decoded = chunks.map((c) => new TextDecoder().decode(c)).join('')
    expect(decoded).toBe('hello stream')
  })

  it('throws ENOENT on missing', async () => {
    const accessor = makeFakeAccessor({
      files: new Map(),
      dirs: new Map([['/', {}]]),
    })
    const it = stream(accessor, spec('/missing'))
    await expect(it[Symbol.asyncIterator]().next()).rejects.toBeDefined()
  })
})

describe('core/ssh/stream.rangeRead', () => {
  it('returns the byte slice [start, end)', async () => {
    const accessor = makeFakeAccessor({
      files: new Map([['/x', { data: new TextEncoder().encode('abcdefghij') }]]),
      dirs: new Map([['/', {}]]),
    })
    const out = await rangeRead(accessor, spec('/x'), 2, 6)
    expect(new TextDecoder().decode(out)).toBe('cdef')
  })
})
