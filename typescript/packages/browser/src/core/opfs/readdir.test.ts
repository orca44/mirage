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
import { mkdir } from './mkdir.ts'
import { readdir } from './readdir.ts'
import { writeBytes } from './write.ts'

describe('opfs/readdir', () => {
  it('lists entries with full virtual paths sorted', async () => {
    const root = makeMockRoot()
    await writeBytes(root, spec('/b'), new Uint8Array())
    await writeBytes(root, spec('/a'), new Uint8Array())
    expect(await readdir(root, spec('/'))).toEqual(['/a', '/b'])
  })
  it('lists nested directory', async () => {
    const root = makeMockRoot()
    await mkdir(root, spec('/sub'))
    await writeBytes(root, spec('/sub/x'), new Uint8Array())
    expect(await readdir(root, spec('/sub'))).toEqual(['/sub/x'])
  })
})
