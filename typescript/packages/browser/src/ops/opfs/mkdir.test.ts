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
import { fakeOPFSResource, makeMockRoot, spec } from '../../test-utils.ts'
import { mkdirOp } from './mkdir.ts'

describe('mkdirOp (opfs)', () => {
  it('creates nested directories (parents=true default)', async () => {
    const root = makeMockRoot()
    await mkdirOp.fn(new OPFSAccessor(fakeOPFSResource(root)), spec('/a/b/c'), [], {})
    expect(await exists(root, spec('/a/b/c'))).toBe(true)
  })
})
