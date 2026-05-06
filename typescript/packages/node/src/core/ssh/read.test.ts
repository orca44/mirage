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
import { read } from './read.ts'

function spec(p: string): PathSpec {
  return PathSpec.fromStrPath(p)
}

describe('core/ssh/read', () => {
  it('returns file bytes for an existing file', async () => {
    const accessor = makeFakeAccessor({
      files: new Map([['/data/a.txt', { data: new TextEncoder().encode('hello') }]]),
      dirs: new Map([
        ['/', {}],
        ['/data', {}],
      ]),
    })
    const data = await read(accessor, spec('/data/a.txt'))
    expect(new TextDecoder().decode(data)).toBe('hello')
  })

  it('throws ENOENT for a missing file', async () => {
    const accessor = makeFakeAccessor({
      files: new Map(),
      dirs: new Map([['/', {}]]),
    })
    await expect(read(accessor, spec('/missing'))).rejects.toThrow(/file not found/)
  })

  it('joins the configured root with the virtual path', async () => {
    const accessor = makeFakeAccessor(
      {
        files: new Map([['/srv/data/a.txt', { data: new TextEncoder().encode('rooted') }]]),
        dirs: new Map([
          ['/srv', {}],
          ['/srv/data', {}],
        ]),
      },
      '/srv',
    )
    const data = await read(accessor, spec('/data/a.txt'))
    expect(new TextDecoder().decode(data)).toBe('rooted')
  })
})
