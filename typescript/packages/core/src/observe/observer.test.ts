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
import { RAMResource } from '../resource/ram/ram.ts'
import { utcDateFolder } from '../utils/dates.ts'
import { ExecutionNode, ExecutionRecord } from '../workspace/types.ts'
import { Observer } from './observer.ts'
import { OpRecord } from './record.ts'

function decode(b: Uint8Array | undefined): string {
  return b === undefined ? '' : new TextDecoder().decode(b)
}

describe('Observer', () => {
  it('writes one JSONL line per op record under the UTC-date folder', async () => {
    const resource = new RAMResource()
    const o = new Observer(resource)
    const rec = new OpRecord({
      op: 'read',
      path: '/data/x.txt',
      source: 'ram',
      bytes: 42,
      timestamp: 1000,
      durationMs: 5,
    })
    await o.logOp(rec, 'agent1', 'sess1')
    const content = decode(resource.store.files.get(`/${utcDateFolder()}/sess1.jsonl`))
    expect(content).toContain('"type":"op"')
    expect(content).toContain('"agent":"agent1"')
    expect(content).toContain('"path":"/data/x.txt"')
    expect(content).toContain('"bytes":42')
    expect(content).toContain('"duration_ms":5')
    expect(content.endsWith('\n')).toBe(true)
  })

  it('tracks distinct sessions', async () => {
    const o = new Observer(new RAMResource())
    const rec = new OpRecord({
      op: 'read',
      path: '/a',
      source: 'ram',
      bytes: 1,
      timestamp: 0,
      durationMs: 0,
    })
    await o.logOp(rec, 'a', 's1')
    await o.logOp(rec, 'a', 's2')
    expect([...o.sessions].sort()).toEqual(['s1', 's2'])
  })

  it('suppresses ops that target the observer mount itself', async () => {
    const resource = new RAMResource()
    const o = new Observer(resource, '/.sessions')
    const selfRec = new OpRecord({
      op: 'read',
      path: '/.sessions/2026-04-29/default.jsonl',
      source: 'ram',
      bytes: 10,
      timestamp: 0,
      durationMs: 0,
    })
    await o.logOp(selfRec, 'a', 'default')
    expect(resource.store.files.get(`/${utcDateFolder()}/default.jsonl`)).toBeUndefined()
  })

  it('appends successive op lines', async () => {
    const resource = new RAMResource()
    const o = new Observer(resource)
    const rec = new OpRecord({
      op: 'read',
      path: '/a',
      source: 'ram',
      bytes: 1,
      timestamp: 0,
      durationMs: 0,
    })
    await o.logOp(rec, 'a', 's')
    await o.logOp(rec, 'a', 's')
    const content = decode(resource.store.files.get(`/${utcDateFolder()}/s.jsonl`))
    expect(content.split('\n').filter((l) => l !== '')).toHaveLength(2)
  })

  it('logs command execution records', async () => {
    const resource = new RAMResource()
    const o = new Observer(resource)
    const exec = new ExecutionRecord({
      agent: 'a',
      command: 'ls /',
      stdout: new TextEncoder().encode('foo\n'),
      exitCode: 0,
      tree: new ExecutionNode({ command: 'ls /', exitCode: 0 }),
      timestamp: 1,
      sessionId: 'default',
    })
    await o.logCommand(exec)
    const content = decode(resource.store.files.get(`/${utcDateFolder()}/default.jsonl`))
    expect(content).toContain('"type":"command"')
    expect(content).toContain('"command":"ls /"')
    expect(content).toContain('"exit_code":0')
    expect(content).toContain('"stdout":"foo\\n"')
  })
})
