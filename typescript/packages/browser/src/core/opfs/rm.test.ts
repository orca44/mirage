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
import { exists } from './exists.ts'
import { mkdir } from './mkdir.ts'
import { rmR } from './rm.ts'
import { writeBytes } from './write.ts'

describe('opfs/rm.rmR', () => {
  it('removes a directory recursively', async () => {
    const root = makeMockRoot()
    await mkdir(root, spec('/d'))
    await writeBytes(root, spec('/d/x'), new TextEncoder().encode('x'))
    await rmR(root, spec('/d'))
    expect(await exists(root, spec('/d'))).toBe(false)
  })
  it('removes a single file', async () => {
    const root = makeMockRoot()
    await writeBytes(root, spec('/x'), new Uint8Array())
    await rmR(root, spec('/x'))
    expect(await exists(root, spec('/x'))).toBe(false)
  })
})
