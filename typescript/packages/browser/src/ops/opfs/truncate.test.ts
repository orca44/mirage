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
import { OPFSAccessor } from '../../accessor/opfs.ts'
import { read } from '../../core/opfs/read.ts'
import { writeBytes } from '../../core/opfs/write.ts'
import { fakeOPFSResource, makeMockRoot, spec } from '../../test-utils.ts'
import { truncateOp } from './truncate.ts'

describe('truncateOp (opfs)', () => {
  it('truncates a file to the given length', async () => {
    const root = makeMockRoot()
    await writeBytes(root, spec('/x'), new TextEncoder().encode('hello world'))
    await truncateOp.fn(new OPFSAccessor(fakeOPFSResource(root)), spec('/x'), [5], {})
    expect(new TextDecoder().decode(await read(root, spec('/x')))).toBe('hello')
  })

  it('throws on non-numeric length', () => {
    const root = makeMockRoot()
    expect(() =>
      truncateOp.fn(new OPFSAccessor(fakeOPFSResource(root)), spec('/x'), ['long'], {}),
    ).toThrow(/number length/)
  })
})
