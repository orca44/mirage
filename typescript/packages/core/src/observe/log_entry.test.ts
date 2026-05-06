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
import { LogEntry } from './log_entry.ts'
import { OpRecord } from './record.ts'
import { ExecutionNode, ExecutionRecord } from '../workspace/types.ts'

const ENC = new TextEncoder()

describe('LogEntry.fromOpRecord', () => {
  it('copies fields from an OpRecord with agent + session', () => {
    const rec = new OpRecord({
      op: 'read',
      path: '/data/file.csv',
      source: 's3',
      bytes: 1024,
      timestamp: 1712145600000,
      durationMs: 45,
    })
    const entry = LogEntry.fromOpRecord(rec, 'agent-1', 'sess-1')
    expect(entry.type).toBe('op')
    expect(entry.agent).toBe('agent-1')
    expect(entry.session).toBe('sess-1')
    expect(entry.op).toBe('read')
    expect(entry.path).toBe('/data/file.csv')
    expect(entry.source).toBe('s3')
    expect(entry.bytes).toBe(1024)
    expect(entry.durationMs).toBe(45)
  })
})

describe('LogEntry.fromExecutionRecord', () => {
  it('copies fields from an ExecutionRecord', () => {
    const rec = new ExecutionRecord({
      agent: 'agent-1',
      command: 'grep foo /data/bar',
      stdout: ENC.encode('matched line\n'),
      stdin: null,
      exitCode: 0,
      tree: new ExecutionNode({ command: 'grep foo /data/bar' }),
      timestamp: Date.now() / 1000,
      sessionId: 'sess-1',
    })
    const entry = LogEntry.fromExecutionRecord(rec)
    expect(entry.type).toBe('command')
    expect(entry.agent).toBe('agent-1')
    expect(entry.session).toBe('sess-1')
    expect(entry.command).toBe('grep foo /data/bar')
    expect(entry.exitCode).toBe(0)
  })
})

describe('LogEntry.toJsonLine', () => {
  it('emits only op fields for an op entry (no command key)', () => {
    const rec = new OpRecord({
      op: 'read',
      path: '/f.csv',
      source: 's3',
      bytes: 100,
      timestamp: 1000,
      durationMs: 5,
    })
    const entry = LogEntry.fromOpRecord(rec, 'a', 's')
    const parsed = JSON.parse(entry.toJsonLine()) as Record<string, unknown>
    expect(parsed.type).toBe('op')
    expect(parsed.agent).toBe('a')
    expect(parsed.op).toBe('read')
    expect(parsed).not.toHaveProperty('command')
  })

  it('emits only command fields for a command entry (no op key)', () => {
    const rec = new ExecutionRecord({
      agent: 'a',
      command: 'ls',
      stdout: ENC.encode('out'),
      stdin: null,
      exitCode: 0,
      tree: new ExecutionNode({ command: 'ls' }),
      timestamp: 1.0,
      sessionId: 's',
    })
    const entry = LogEntry.fromExecutionRecord(rec)
    const parsed = JSON.parse(entry.toJsonLine()) as Record<string, unknown>
    expect(parsed.type).toBe('command')
    expect(parsed.command).toBe('ls')
    expect(parsed).not.toHaveProperty('op')
  })

  it('includes cwd when provided for op entries', () => {
    const rec = new OpRecord({
      op: 'read',
      path: '/f.csv',
      source: 's3',
      bytes: 100,
      timestamp: 1000,
      durationMs: 5,
    })
    const entry = LogEntry.fromOpRecord(rec, 'a', 's', '/data')
    const parsed = JSON.parse(entry.toJsonLine()) as Record<string, unknown>
    expect(parsed.cwd).toBe('/data')
  })

  it('includes cwd when provided for command entries', () => {
    const rec = new ExecutionRecord({
      agent: 'a',
      command: 'ls',
      stdout: ENC.encode('out'),
      stdin: null,
      exitCode: 0,
      tree: new ExecutionNode({ command: 'ls' }),
      timestamp: 1.0,
      sessionId: 's',
    })
    const entry = LogEntry.fromExecutionRecord(rec, '/data')
    const parsed = JSON.parse(entry.toJsonLine()) as Record<string, unknown>
    expect(parsed.cwd).toBe('/data')
  })

  it('omits cwd when not provided', () => {
    const rec = new OpRecord({
      op: 'read',
      path: '/f.csv',
      source: 's3',
      bytes: 100,
      timestamp: 1000,
      durationMs: 5,
    })
    const entry = LogEntry.fromOpRecord(rec, 'a', 's')
    const parsed = JSON.parse(entry.toJsonLine()) as Record<string, unknown>
    expect(parsed).not.toHaveProperty('cwd')
  })
})
