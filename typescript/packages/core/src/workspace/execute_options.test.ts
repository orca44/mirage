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
import { OpsRegistry } from '../ops/registry.ts'
import { RAMResource } from '../resource/ram/ram.ts'
import { MountMode } from '../types.ts'
import { getTestParser, stdoutStr } from './fixtures/workspace_fixture.ts'
import { Workspace } from './workspace.ts'

const ENC = new TextEncoder()

async function makeWs(): Promise<Workspace> {
  const parser = await getTestParser()
  const r = new RAMResource()
  r.store.dirs.add('/')
  r.store.dirs.add('/subdir')
  r.store.dirs.add('/subdir/nested')
  r.store.files.set('/subdir/file.txt', ENC.encode('hello'))
  r.store.files.set('/subdir/nested/deep.txt', ENC.encode('deep'))

  const registry = new OpsRegistry()
  registry.registerResource(r)
  return new Workspace(
    { '/ram/': r },
    { mode: MountMode.WRITE, ops: registry, shellParser: parser },
  )
}

describe('execute({ cwd }): bash subshell semantics', () => {
  it('runs the command in the override cwd, like (cd /ram/subdir && pwd)', async () => {
    const ws = await makeWs()
    const r = await ws.execute('pwd', { cwd: '/ram/subdir' })
    expect(stdoutStr(r).trim()).toBe('/ram/subdir')
    await ws.close()
  })

  it('does not mutate session.cwd', async () => {
    const ws = await makeWs()
    const before = ws.cwd
    await ws.execute('pwd', { cwd: '/ram/subdir' })
    expect(ws.cwd).toBe(before)
    await ws.close()
  })

  it('does not let `cd` inside the call leak back to session.cwd', async () => {
    const ws = await makeWs()
    const before = ws.cwd
    await ws.execute('cd /ram/subdir', { cwd: '/ram' })
    expect(ws.cwd).toBe(before)
    await ws.close()
  })

  it('does not leak between parallel calls (isolation regression guard)', async () => {
    const ws = await makeWs()
    const [a, b] = await Promise.all([
      ws.execute('pwd', { cwd: '/ram/subdir' }),
      ws.execute('pwd', { cwd: '/ram' }),
    ])
    expect(stdoutStr(a).trim()).toBe('/ram/subdir')
    expect(stdoutStr(b).trim()).toBe('/ram')
    await ws.close()
  })

  it("setup mutates session, per-call overrides inherit and do not leak", async () => {
    const ws = await makeWs()
    const cwdBefore = ws.cwd
    await ws.execute('export DEBUG=1')
    const [a, b] = await Promise.all([
      ws.execute('printenv DEBUG; pwd', { cwd: '/ram/subdir' }),
      ws.execute('printenv DEBUG; pwd', { cwd: '/ram' }),
    ])
    expect(stdoutStr(a)).toContain('1')
    expect(stdoutStr(a)).toContain('/ram/subdir')
    expect(stdoutStr(b)).toContain('1')
    expect(stdoutStr(b)).toContain('/ram')
    expect(ws.env.DEBUG).toBe('1')
    expect(ws.cwd).toBe(cwdBefore)
    await ws.close()
  })

  it('propagates lastExitCode back to the persistent session', async () => {
    const ws = await makeWs()
    await ws.execute('false', { cwd: '/ram/subdir' })
    expect(ws.sessionManager.get(ws.sessionManager.defaultId).lastExitCode).toBe(1)
    await ws.close()
  })

  it('does not let function definitions leak back to session.functions', async () => {
    const ws = await makeWs()
    await ws.execute('greet() { echo hi; }', { cwd: '/ram' })
    const session = ws.sessionManager.get(ws.sessionManager.defaultId)
    expect(session.functions.greet).toBeUndefined()
  })
})
