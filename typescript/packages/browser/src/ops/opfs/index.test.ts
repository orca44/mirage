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
import { ResourceName } from '@struktoai/mirage-core'
import {
  appendOp,
  createOp,
  mkdirOp,
  OPFS_OPS,
  readdirOp,
  readOp,
  renameOp,
  rmdirOp,
  statOp,
  truncateOp,
  unlinkOp,
  writeOp,
} from './index.ts'

describe('OPFS_OPS', () => {
  it('contains all 11 OPFS op names', () => {
    expect(new Set(OPFS_OPS.map((o) => o.name))).toEqual(
      new Set([
        'append',
        'create',
        'mkdir',
        'read',
        'readdir',
        'rename',
        'rmdir',
        'stat',
        'truncate',
        'unlink',
        'write',
      ]),
    )
  })

  it('every op targets ResourceName.OPFS', () => {
    for (const op of OPFS_OPS) expect(op.resource).toBe(ResourceName.OPFS)
  })

  it('write-side ops are flagged write:true', () => {
    expect(new Set(OPFS_OPS.filter((o) => o.write).map((o) => o.name))).toEqual(
      new Set(['append', 'create', 'mkdir', 'rename', 'rmdir', 'truncate', 'unlink', 'write']),
    )
  })

  it('exports each op individually', () => {
    expect(appendOp.name).toBe('append')
    expect(createOp.name).toBe('create')
    expect(mkdirOp.name).toBe('mkdir')
    expect(readOp.name).toBe('read')
    expect(readdirOp.name).toBe('readdir')
    expect(renameOp.name).toBe('rename')
    expect(rmdirOp.name).toBe('rmdir')
    expect(statOp.name).toBe('stat')
    expect(truncateOp.name).toBe('truncate')
    expect(unlinkOp.name).toBe('unlink')
    expect(writeOp.name).toBe('write')
  })
})
