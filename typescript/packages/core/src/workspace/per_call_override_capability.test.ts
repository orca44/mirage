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
import { makeWorkspace, stdoutStr } from './fixtures/workspace_fixture.ts'

// `Workspace.execute({cwd, env})` constructs a new Session via
// `targetSession.fork({...})`. fork() must propagate allowedMounts so
// the per-call override session cannot bypass the parent's allowlist.
// Without fork() (or without manually copying allowedMounts in the old
// inline `new Session({...})` ctor) this test would fail because the
// override session would have allowedMounts === null and assertMountAllowed
// would short-circuit on the `if (sess?.allowedMounts == null) return`
// branch in runtime/session_context.ts.
describe('per-call cwd/env override preserves allowedMounts', () => {
  it('execute({cwd}) on a restricted session still rejects out-of-allowlist mounts', async () => {
    const { ws } = await makeWorkspace()
    ws.createSession('restricted', { allowedMounts: new Set(['/disk']) })
    const io = await ws.execute('cat /ram/notes.txt', {
      sessionId: 'restricted',
      cwd: '/disk',
    })
    expect(io.exitCode).not.toBe(0)
    expect(stdoutStr(io).includes('line1')).toBe(false)
    await ws.close()
  })

  it('execute({env}) on a restricted session still rejects out-of-allowlist mounts', async () => {
    const { ws } = await makeWorkspace()
    ws.createSession('restricted', { allowedMounts: new Set(['/disk']) })
    const io = await ws.execute('cat /ram/notes.txt', {
      sessionId: 'restricted',
      env: { EXTRA: '1' },
    })
    expect(io.exitCode).not.toBe(0)
    expect(stdoutStr(io).includes('line1')).toBe(false)
    await ws.close()
  })

  it('execute({cwd}) on a restricted session can still reach allowed mounts', async () => {
    const { ws } = await makeWorkspace()
    ws.createSession('restricted', { allowedMounts: new Set(['/disk']) })
    const io = await ws.execute('cat /disk/readme.txt', {
      sessionId: 'restricted',
      cwd: '/disk',
    })
    expect(io.exitCode).toBe(0)
    expect(stdoutStr(io).includes('disk readme')).toBe(true)
    await ws.close()
  })
})
