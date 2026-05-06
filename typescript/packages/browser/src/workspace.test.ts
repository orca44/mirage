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

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MountMode, RAMResource } from '@struktoai/mirage-core'
import { installFakeNavigator, makeMockRoot } from './test-utils.ts'
import { Workspace } from './workspace.ts'

let restoreNav: () => void

beforeEach(() => {
  restoreNav = installFakeNavigator(() => makeMockRoot())
})
afterEach(() => {
  restoreNav()
})

describe('@struktoai/mirage-browser Workspace', () => {
  it('lazy-decodes inlined WASM and runs `echo hi` end-to-end', async () => {
    const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
    const res = await ws.execute('echo hi')
    expect(res.exitCode).toBe(0)
    expect(new TextDecoder().decode(res.stdout)).toBe('hi\n')
    await ws.close()
  })

  it('reuses the cached parser across executes', async () => {
    const ws = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
    const r1 = await ws.execute('echo one')
    const r2 = await ws.execute('echo two')
    expect(new TextDecoder().decode(r1.stdout)).toBe('one\n')
    expect(new TextDecoder().decode(r2.stdout)).toBe('two\n')
    await ws.close()
  })

  it('assigns a unique sessionId per Workspace by default', async () => {
    const a = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
    const b = new Workspace({ '/data': new RAMResource() }, { mode: MountMode.WRITE })
    expect(a.sessionManager.defaultId).not.toBe('default')
    expect(b.sessionManager.defaultId).not.toBe('default')
    expect(a.sessionManager.defaultId).not.toBe(b.sessionManager.defaultId)
    await a.close()
    await b.close()
  })

  it('honors an explicit sessionId option', async () => {
    const ws = new Workspace(
      { '/data': new RAMResource() },
      { mode: MountMode.WRITE, sessionId: 'pinned' },
    )
    expect(ws.sessionManager.defaultId).toBe('pinned')
    await ws.close()
  })

  it('respects explicitly provided shellParserFactory (overrides inlined WASM)', async () => {
    let calls = 0
    const ws = new Workspace(
      { '/data': new RAMResource() },
      {
        mode: MountMode.WRITE,
        shellParserFactory: async () => {
          calls += 1
          const { Workspace: NodeWorkspace } = await import('./workspace.ts')
          // borrow the default factory: call execute() on a sibling Workspace
          // to fetch its parser indirectly. Instead, simpler: lazy-import core.
          const { createShellParser } = await import('@struktoai/mirage-core')
          const { ENGINE_WASM_BASE64, GRAMMAR_WASM_BASE64 } = await import('./generated/wasm.ts')
          void NodeWorkspace
          const decode = (b64: string): Uint8Array => {
            const bin = atob(b64)
            const out = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
            return out
          }
          return createShellParser({
            engineWasm: decode(ENGINE_WASM_BASE64),
            grammarWasm: decode(GRAMMAR_WASM_BASE64),
          })
        },
      },
    )
    await ws.execute('echo a')
    await ws.execute('echo b')
    expect(calls).toBe(1)
    await ws.close()
  })
})
