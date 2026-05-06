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
import { makeMockRoot, spec } from '../../test-utils.ts'
import { read } from './read.ts'
import { truncate } from './truncate.ts'
import { writeBytes } from './write.ts'

describe('opfs/truncate', () => {
  it('shrinks a file', async () => {
    const root = makeMockRoot()
    await writeBytes(root, spec('/x'), new TextEncoder().encode('hello world'))
    await truncate(root, spec('/x'), 5)
    expect(new TextDecoder().decode(await read(root, spec('/x')))).toBe('hello')
  })
  it('zero-fills when growing', async () => {
    const root = makeMockRoot()
    await writeBytes(root, spec('/x'), new TextEncoder().encode('ab'))
    await truncate(root, spec('/x'), 4)
    const out = await read(root, spec('/x'))
    expect(out.byteLength).toBe(4)
    expect(out[2]).toBe(0)
  })
})
