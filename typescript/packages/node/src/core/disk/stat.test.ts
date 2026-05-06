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

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DiskAccessor } from '../../accessor/disk.ts'
import { FileType } from '@struktoai/mirage-core'
import { spec, tmpRoot } from '../../test-utils.ts'
import { stat } from './stat.ts'

let root: string
let accessor: DiskAccessor
let cleanup: () => void

beforeEach(() => {
  ;({ root, accessor, cleanup } = tmpRoot('mirage-core-disk-stat-'))
})
afterEach(() => {
  cleanup()
})

describe('core/disk/stat', () => {
  it('returns FileStat with size and modified for a file', async () => {
    await writeFile(join(root, 'a.txt'), 'abc')
    const s = await stat(accessor, spec('/a.txt'))
    expect(s.size).toBe(3)
    expect(s.modified).not.toBeNull()
  })

  it('returns DIRECTORY type for a directory', async () => {
    await mkdir(join(root, 'd'))
    const s = await stat(accessor, spec('/d'))
    expect(s.type).toBe(FileType.DIRECTORY)
    expect(s.size).toBeNull()
  })

  it('throws "file not found" on missing', async () => {
    await expect(stat(accessor, spec('/nope'))).rejects.toThrow(/file not found/)
  })
})
