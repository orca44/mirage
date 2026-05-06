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
import { PyodideRuntime } from './runtime.ts'
import type { BridgeDispatchFn } from './mirage_bridge.ts'

function makeBridge(): {
  dispatch: BridgeDispatchFn
  calls: { op: string; path: string; bytes?: Uint8Array }[]
  files: Map<string, Uint8Array>
} {
  const calls: { op: string; path: string; bytes?: Uint8Array }[] = []
  const files = new Map<string, Uint8Array>()
  const dispatch: BridgeDispatchFn = (op, path, bytes) => {
    const normalizedBytes = bytes ? new Uint8Array(bytes) : undefined
    const entry: { op: string; path: string; bytes?: Uint8Array } =
      normalizedBytes !== undefined ? { op, path, bytes: normalizedBytes } : { op, path }
    calls.push(entry)
    if (op === 'WRITE') {
      files.set(path, normalizedBytes ?? new Uint8Array())
      return Promise.resolve(undefined)
    }
    if (op === 'READ') return Promise.resolve(files.get(path) ?? new Uint8Array())
    const prefix = path
    const entries: { path: string; size: number; isDir: boolean }[] = []
    for (const [p, content] of files) {
      if (p.startsWith(prefix)) {
        const rest = p.slice(prefix.length)
        if (!rest.includes('/')) {
          entries.push({ path: p, size: content.length, isDir: false })
        }
      }
    }
    return Promise.resolve(entries)
  }
  return { dispatch, calls, files }
}

describe('PyodideRuntime mount lifecycle', () => {
  it('addMount preloads files into MEMFS so Python reads see them', async () => {
    const { dispatch, files } = makeBridge()
    files.set('/ram/hello.txt', new TextEncoder().encode('world'))
    const rt = new PyodideRuntime({ workspaceBridge: dispatch })
    await rt.addMount('/ram/')
    const result = await rt.run({
      code: `with open('/ram/hello.txt') as f: print(f.read())`,
      args: [],
      env: {},
      stdin: new Uint8Array(),
    })
    expect(new TextDecoder().decode(result.stdout)).toContain('world')
    expect(result.exitCode).toBe(0)
    await rt.close()
  }, 60_000)

  it('writes after addMount flush via the bridge on close', async () => {
    const { dispatch, calls } = makeBridge()
    const rt = new PyodideRuntime({ workspaceBridge: dispatch })
    await rt.addMount('/ram/')
    await rt.run({
      code: `with open('/ram/out.txt', 'wb') as f: f.write(b'data')`,
      args: [],
      env: {},
      stdin: new Uint8Array(),
    })
    const writes = calls.filter((c) => c.op === 'WRITE')
    expect(writes).toHaveLength(1)
    const w0 = writes[0]
    if (w0?.bytes === undefined) throw new Error('unreachable')
    expect(w0.path).toBe('/ram/out.txt')
    expect(new TextDecoder().decode(w0.bytes)).toBe('data')
    await rt.close()
  }, 60_000)

  it('removeMount stops flushing for the prefix', async () => {
    const { dispatch, calls } = makeBridge()
    const rt = new PyodideRuntime({ workspaceBridge: dispatch })
    await rt.addMount('/ram/')
    await rt.removeMount('/ram/')
    await rt.run({
      code: `with open('/ram/x.txt', 'wb') as f: f.write(b'nope')`,
      args: [],
      env: {},
      stdin: new Uint8Array(),
    })
    expect(calls.filter((c) => c.op === 'WRITE')).toHaveLength(0)
    await rt.close()
  }, 60_000)

  it('addMount throws when no workspaceBridge is configured', async () => {
    const rt = new PyodideRuntime({})
    await expect(rt.addMount('/ram/')).rejects.toThrow(/workspaceBridge/)
    await rt.close()
  }, 60_000)

  it('runtime without bridge still runs Python without the shim', async () => {
    const rt = new PyodideRuntime({})
    const result = await rt.run({
      code: 'print("hello")',
      args: [],
      env: {},
      stdin: new Uint8Array(),
    })
    expect(new TextDecoder().decode(result.stdout)).toContain('hello')
    expect(result.exitCode).toBe(0)
    await rt.close()
  }, 60_000)

  it('removeMount on a never-mounted prefix is a silent no-op', async () => {
    const { dispatch, calls } = makeBridge()
    const rt = new PyodideRuntime({ workspaceBridge: dispatch })
    await rt.removeMount('/never-mounted/')
    expect(calls).toHaveLength(0)
    await rt.close()
  }, 60_000)

  it('addMount before run() is deferred and applied when Python first runs', async () => {
    const { dispatch, calls, files } = makeBridge()
    files.set('/ram/lazy.txt', new TextEncoder().encode('lazy'))
    const rt = new PyodideRuntime({ workspaceBridge: dispatch })
    await rt.addMount('/ram/')
    expect(calls).toHaveLength(0)
    const result = await rt.run({
      code: `with open('/ram/lazy.txt') as f: print(f.read())`,
      args: [],
      env: {},
      stdin: new Uint8Array(),
    })
    expect(new TextDecoder().decode(result.stdout)).toContain('lazy')
    expect(calls.some((c) => c.op === 'LIST' && c.path === '/ram/')).toBe(true)
    await rt.close()
  }, 60_000)

  it('addMount is idempotent — calling twice does not re-preload', async () => {
    const { dispatch, calls, files } = makeBridge()
    files.set('/ram/x.txt', new Uint8Array([1, 2, 3]))
    const rt = new PyodideRuntime({ workspaceBridge: dispatch })
    await rt.addMount('/ram/')
    const initialReadCount = calls.filter((c) => c.op === 'READ').length
    await rt.addMount('/ram/')
    const finalReadCount = calls.filter((c) => c.op === 'READ').length
    expect(finalReadCount).toBe(initialReadCount)
    await rt.close()
  }, 60_000)
})
