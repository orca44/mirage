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
import { stream } from './stream.ts'
import { writeBytes } from './write.ts'

describe('opfs/stream', () => {
  it('yields all bytes', async () => {
    const root = makeMockRoot()
    await writeBytes(root, spec('/x'), new TextEncoder().encode('hello stream'))
    const chunks: Uint8Array[] = []
    for await (const c of stream(root, spec('/x'))) chunks.push(c)
    const decoded = chunks.map((c) => new TextDecoder().decode(c)).join('')
    expect(decoded).toBe('hello stream')
  })
  it('throws "file not found" on missing', async () => {
    const root = makeMockRoot()
    const it = stream(root, spec('/missing'))
    await expect(it[Symbol.asyncIterator]().next()).rejects.toThrow(/file not found/)
  })
})
