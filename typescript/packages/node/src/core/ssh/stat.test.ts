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
import { FileType, PathSpec } from '@struktoai/mirage-core'
import { makeFakeAccessor } from './_test_utils.ts'
import { stat } from './stat.ts'

function spec(p: string): PathSpec {
  return PathSpec.fromStrPath(p)
}

describe('core/ssh/stat', () => {
  it('returns FileStat for an existing file', async () => {
    const accessor = makeFakeAccessor({
      files: new Map([['/a.txt', { data: new TextEncoder().encode('abc') }]]),
      dirs: new Map([['/', {}]]),
    })
    const s = await stat(accessor, spec('/a.txt'))
    expect(s.size).toBe(3)
    expect(s.name).toBe('a.txt')
  })

  it('returns DIRECTORY type for a directory', async () => {
    const accessor = makeFakeAccessor({
      files: new Map(),
      dirs: new Map([
        ['/', {}],
        ['/d', {}],
      ]),
    })
    const s = await stat(accessor, spec('/d'))
    expect(s.type).toBe(FileType.DIRECTORY)
    expect(s.size).toBeNull()
  })

  it('throws ENOENT for missing path', async () => {
    const accessor = makeFakeAccessor({
      files: new Map(),
      dirs: new Map([['/', {}]]),
    })
    await expect(stat(accessor, spec('/nope'))).rejects.toThrow(/file not found/)
  })
})
