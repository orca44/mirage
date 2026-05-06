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

import { describe, expect, it, vi } from 'vitest'
import { ExecutionHistory } from './history.ts'
import { ExecutionNode, ExecutionRecord } from './types.ts'

function makeRecord(cmd: string): ExecutionRecord {
  return new ExecutionRecord({
    agent: 'a',
    command: cmd,
    stdout: new Uint8Array(),
    exitCode: 0,
    tree: new ExecutionNode(),
    timestamp: 0,
  })
}

describe('ExecutionHistory', () => {
  it('defaults maxEntries to 100', async () => {
    const h = new ExecutionHistory()
    for (let i = 0; i < 110; i++) await h.append(makeRecord(`c${i.toString()}`))
    expect(h.entries()).toHaveLength(100)
    expect(h.entries()[0]?.command).toBe('c10')
    expect(h.entries()[99]?.command).toBe('c109')
  })

  it('respects custom maxEntries and drops oldest', async () => {
    const h = new ExecutionHistory({ maxEntries: 3 })
    await h.append(makeRecord('a'))
    await h.append(makeRecord('b'))
    await h.append(makeRecord('c'))
    await h.append(makeRecord('d'))
    expect(h.entries().map((r) => r.command)).toEqual(['b', 'c', 'd'])
  })

  it('invokes onPersist for each append', async () => {
    const spy = vi.fn()
    const h = new ExecutionHistory({ onPersist: spy })
    await h.append(makeRecord('x'))
    await h.append(makeRecord('y'))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('clear() empties the buffer', async () => {
    const h = new ExecutionHistory({ maxEntries: 5 })
    await h.append(makeRecord('x'))
    h.clear()
    expect(h.entries()).toEqual([])
  })
})
