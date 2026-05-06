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
import { copy } from './copy.ts'
import { read } from './read.ts'
import { writeBytes } from './write.ts'

describe('opfs/copy', () => {
  it('duplicates a file', async () => {
    const root = makeMockRoot()
    await writeBytes(root, spec('/src'), new TextEncoder().encode('CP'))
    await copy(root, spec('/src'), spec('/dst'))
    expect(new TextDecoder().decode(await read(root, spec('/dst')))).toBe('CP')
  })
  it('creates parent directories for the destination', async () => {
    const root = makeMockRoot()
    await writeBytes(root, spec('/src'), new TextEncoder().encode('X'))
    await copy(root, spec('/src'), spec('/a/b/dst'))
    expect(new TextDecoder().decode(await read(root, spec('/a/b/dst')))).toBe('X')
  })
})
