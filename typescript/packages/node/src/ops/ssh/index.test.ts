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
  readdirOp,
  readOp,
  renameOp,
  rmdirOp,
  SSH_OPS,
  statOp,
  truncateOp,
  unlinkOp,
  writeOp,
} from './index.ts'

describe('SSH_OPS', () => {
  it('registers the expected 11 ops with resource=ssh', () => {
    expect(SSH_OPS).toHaveLength(11)
    for (const op of SSH_OPS) expect(op.resource).toBe(ResourceName.SSH)
  })

  it('contains all ssh op names', () => {
    const names = new Set(SSH_OPS.map((op) => op.name))
    expect(names).toEqual(
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

  it('write-side ops are flagged write:true', () => {
    const writes = new Set(SSH_OPS.filter((o) => o.write).map((o) => o.name))
    expect(writes).toEqual(
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
