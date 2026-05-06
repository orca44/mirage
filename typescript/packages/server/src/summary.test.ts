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
import { RAMResource, Workspace, MountMode } from '@struktoai/mirage-node'
import { WorkspaceRegistry } from './registry.ts'
import { makeBrief, makeDetail } from './summary.ts'

describe('summary', () => {
  it('makeBrief reports prefix count + workspace mode', () => {
    const r = new WorkspaceRegistry()
    const ws = new Workspace({ '/data/': new RAMResource() }, { mode: MountMode.WRITE })
    const entry = r.add(ws, 'ws-x')
    const brief = makeBrief(entry)
    expect(brief.id).toBe('ws-x')
    expect(brief.mode).toBe('write')
    expect(brief.mountCount).toBe(1)
  })

  it('makeDetail emits mounts + sessions', () => {
    const r = new WorkspaceRegistry()
    const ws = new Workspace({ '/data/': new RAMResource() }, { mode: MountMode.WRITE })
    const entry = r.add(ws, 'ws-y')
    const detail = makeDetail(entry)
    expect(detail.mounts).toHaveLength(1)
    expect(detail.mounts[0]?.prefix).toBe('/data/')
    expect(detail.mounts[0]?.resource).toBe('ram')
  })
})
