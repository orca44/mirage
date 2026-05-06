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
import { exists } from '../../core/opfs/exists.ts'
import { read } from '../../core/opfs/read.ts'
import { writeBytes } from '../../core/opfs/write.ts'
import { fakeOPFSResource, makeMockRoot, spec } from '../../test-utils.ts'
import { renameOp } from './rename.ts'

describe('renameOp (opfs)', () => {
  it('moves a file', async () => {
    const root = makeMockRoot()
    await writeBytes(root, spec('/a'), new TextEncoder().encode('hi'))
    await renameOp.fn(new OPFSAccessor(fakeOPFSResource(root)), spec('/a'), [spec('/b')], {})
    expect(await exists(root, spec('/a'))).toBe(false)
    expect(new TextDecoder().decode(await read(root, spec('/b')))).toBe('hi')
  })

  it('throws when dst is not a PathSpec', () => {
    const root = makeMockRoot()
    expect(() =>
      renameOp.fn(new OPFSAccessor(fakeOPFSResource(root)), spec('/a'), ['plain'], {}),
    ).toThrow(/PathSpec destination/)
  })
})
