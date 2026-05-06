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

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { OpsRegistry } from '../ops/registry.ts'
import { RAMResource } from '../resource/ram/ram.ts'
import { createShellParser, type ShellParser } from '../shell/parse.ts'
import { MountMode } from '../types.ts'
import { utcDateFolder } from '../utils/dates.ts'
import { Workspace } from './workspace.ts'

const require = createRequire(import.meta.url)
const engineWasm = readFileSync(require.resolve('web-tree-sitter/web-tree-sitter.wasm'))
const grammarWasm = readFileSync(require.resolve('tree-sitter-bash/tree-sitter-bash.wasm'))

const DEC = new TextDecoder()

let parser: ShellParser

beforeAll(async () => {
  parser = await createShellParser({ engineWasm, grammarWasm })
})

function buildWorkspace(
  opts: {
    observerResource?: RAMResource
    observerPrefix?: string
  } = {},
): Workspace {
  const ram = new RAMResource()
  const registry = new OpsRegistry()
  registry.registerResource(ram)
  const options: {
    mode: MountMode
    ops: OpsRegistry
    shellParser: ShellParser
    observerResource?: RAMResource
    observerPrefix?: string
  } = { mode: MountMode.WRITE, ops: registry, shellParser: parser }
  if (opts.observerResource !== undefined) options.observerResource = opts.observerResource
  if (opts.observerPrefix !== undefined) options.observerPrefix = opts.observerPrefix
  return new Workspace({ '/data': ram }, options)
}

function jsonlSessionFiles(store: RAMResource['store']): string[] {
  return [...store.files.keys()].filter((k) => k.endsWith('.jsonl'))
}

describe('Workspace observer wiring', () => {
  it('creates a default observer with prefix /.sessions', () => {
    const ws = buildWorkspace()
    expect(ws.observer).toBeDefined()
    expect(ws.observer.prefix).toBe('/.sessions')
  })

  it('uses a custom observer resource when provided', () => {
    const obs = new RAMResource()
    const ws = buildWorkspace({ observerResource: obs })
    expect(ws.observer.resource).toBe(obs)
  })

  it('uses a custom observer prefix when provided', () => {
    const ws = buildWorkspace({ observerPrefix: '/audit' })
    expect(ws.observer.prefix).toBe('/audit')
  })

  it('writes at least one command entry after an execute', async () => {
    const obs = new RAMResource()
    const ws = buildWorkspace({ observerResource: obs })
    await ws.execute('echo hello > /data/test.txt')
    const files = jsonlSessionFiles(obs.store)
    expect(files.length).toBeGreaterThanOrEqual(1)
    const first = files[0]
    if (first === undefined) throw new Error('no session file')
    const data = DEC.decode(obs.store.files.get(first))
    const lines = data
      .trim()
      .split('\n')
      .filter((l) => l !== '')
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const lastLine = lines[lines.length - 1]
    if (lastLine === undefined) throw new Error('no log lines')
    const entry = JSON.parse(lastLine) as Record<string, unknown>
    expect(entry.type).toBe('command')
    await ws.close()
  })

  it('writes both op and command entries after reads and writes', async () => {
    const obs = new RAMResource()
    const ws = buildWorkspace({ observerResource: obs })
    await ws.execute('echo hello > /data/test.txt')
    await ws.execute('cat /data/test.txt')
    const files = jsonlSessionFiles(obs.store)
    const first = files[0]
    if (first === undefined) throw new Error('no session file')
    const data = DEC.decode(obs.store.files.get(first))
    const types = new Set(
      data
        .trim()
        .split('\n')
        .filter((l) => l !== '')
        .map((l) => (JSON.parse(l) as Record<string, unknown>).type),
    )
    expect(types.has('op')).toBe(true)
    expect(types.has('command')).toBe(true)
    await ws.close()
  })

  it('makes the observer mount readable via execute (ls /.sessions)', async () => {
    const ws = buildWorkspace()
    await ws.execute('echo hi > /data/f.txt')
    const dayRes = await ws.execute('ls /.sessions')
    expect(dayRes.exitCode).toBe(0)
    expect(DEC.decode(dayRes.stdout)).toContain(utcDateFolder())
    const res = await ws.execute(`ls /.sessions/${utcDateFolder()}`)
    expect(res.exitCode).toBe(0)
    expect(DEC.decode(res.stdout)).toContain('.jsonl')
    await ws.close()
  })

  it('makes the observer mount read-only for writes via execute', async () => {
    const ws = buildWorkspace()
    const res = await ws.execute('echo test > /.sessions/hack.txt')
    expect(res.exitCode).not.toBe(0)
    await ws.close()
  })
})
