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

  it('setup mutates session, per-call overrides inherit and do not leak', async () => {
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

describe('execute({ env }): bash subshell semantics', () => {
  it('exposes override env to the command, like env FOO=bar printenv FOO', async () => {
    const ws = await makeWs()
    const r = await ws.execute('printenv FOO', { env: { FOO: 'bar' } })
    expect(r.exitCode).toBe(0)
    expect(stdoutStr(r).trim()).toBe('bar')
    await ws.close()
  })

  it('does not mutate session.env', async () => {
    const ws = await makeWs()
    const before = { ...ws.env }
    await ws.execute('printenv FOO', { env: { FOO: 'bar' } })
    expect(ws.env).toEqual(before)
    await ws.close()
  })

  it('does not let `export` inside the call leak back to session.env', async () => {
    const ws = await makeWs()
    await ws.execute('export LEAKED=yes', { env: { FOO: 'bar' } })
    expect(ws.env.LEAKED).toBeUndefined()
    await ws.close()
  })

  it('layers onto, does not replace, session env', async () => {
    const ws = await makeWs()
    await ws.execute('export BASE=keep')
    const r = await ws.execute('printenv BASE; printenv FOO', { env: { FOO: 'bar' } })
    expect(stdoutStr(r)).toContain('keep')
    expect(stdoutStr(r)).toContain('bar')
    expect(ws.env.BASE).toBe('keep')
    expect(ws.env.FOO).toBeUndefined()
    await ws.close()
  })

  it('does not leak between parallel calls (isolation regression guard)', async () => {
    const ws = await makeWs()
    const [a, b] = await Promise.all([
      ws.execute('printenv X', { env: { X: 'one' } }),
      ws.execute('printenv X', { env: { X: 'two' } }),
    ])
    expect(stdoutStr(a).trim()).toBe('one')
    expect(stdoutStr(b).trim()).toBe('two')
    await ws.close()
  })
})

describe('execute({ signal }): mid-flight cancellation', () => {
  it('rejects with AbortError when signal is pre-aborted (regression guard)', async () => {
    const ws = await makeWs()
    const ac = new AbortController()
    ac.abort()
    await expect(ws.execute('echo hi', { signal: ac.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    await ws.close()
  })

  it('aborts a sleeping command within ~timeout window', async () => {
    const ws = await makeWs()
    const t0 = Date.now()
    await expect(ws.execute('sleep 5', { signal: AbortSignal.timeout(100) })).rejects.toMatchObject(
      { name: 'AbortError' },
    )
    expect(Date.now() - t0).toBeLessThan(1000)
    await ws.close()
  })

  it('aborts inside a for loop within one iteration', async () => {
    const ws = await makeWs()
    const t0 = Date.now()
    const ac = new AbortController()
    setTimeout(() => {
      ac.abort()
    }, 100)
    await expect(
      ws.execute('for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; done', {
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(1500)
    await ws.close()
  })

  it('aborts between LIST stages', async () => {
    const ws = await makeWs()
    const t0 = Date.now()
    const ac = new AbortController()
    setTimeout(() => {
      ac.abort()
    }, 100)
    await expect(
      ws.execute('sleep 1 && sleep 1 && sleep 1 && echo done', {
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(2000)
    await ws.close()
  })

  it('aborts inside a while loop', async () => {
    const ws = await makeWs()
    const t0 = Date.now()
    const ac = new AbortController()
    setTimeout(() => {
      ac.abort()
    }, 100)
    await expect(
      ws.execute('while true; do sleep 1; done', { signal: ac.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(1500)
    await ws.close()
  })

  it('aborts mid-pipeline', async () => {
    const ws = await makeWs()
    const t0 = Date.now()
    const ac = new AbortController()
    setTimeout(() => {
      ac.abort()
    }, 100)
    await expect(
      ws.execute('sleep 1 | sleep 1 | sleep 1', { signal: ac.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(1500)
    await ws.close()
  })

  it('aborts inside a command substitution', async () => {
    const ws = await makeWs()
    const t0 = Date.now()
    await expect(
      ws.execute('echo "$(sleep 5)"', { signal: AbortSignal.timeout(100) }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(1000)
    await ws.close()
  })

  it('aborts on manual AbortController.abort() during sleep', async () => {
    const ws = await makeWs()
    const t0 = Date.now()
    const ac = new AbortController()
    setTimeout(() => {
      ac.abort()
    }, 100)
    await expect(ws.execute('sleep 5', { signal: ac.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(Date.now() - t0).toBeLessThan(1000)
    await ws.close()
  })

  it('aborts inside a shell-syntax subshell (sleep 5)', async () => {
    const ws = await makeWs()
    const t0 = Date.now()
    await expect(
      ws.execute('(sleep 5)', { signal: AbortSignal.timeout(100) }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(1000)
    await ws.close()
  })

  it('aborts inside a user-defined function body', async () => {
    const ws = await makeWs()
    await ws.execute('loopy() { while true; do sleep 1; done; }')
    const t0 = Date.now()
    await expect(
      ws.execute('loopy', { signal: AbortSignal.timeout(100) }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(1500)
    await ws.close()
  })

  it('workspace remains usable after an aborted command', async () => {
    const ws = await makeWs()
    await expect(
      ws.execute('sleep 5', { signal: AbortSignal.timeout(50) }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    const r = await ws.execute('echo recovered')
    expect(r.exitCode).toBe(0)
    expect(stdoutStr(r).trim()).toBe('recovered')
    await ws.close()
  })

  it('does not pollute session.lastExitCode on abort', async () => {
    const ws = await makeWs()
    await ws.execute('true')
    expect(ws.sessionManager.get(ws.sessionManager.defaultId).lastExitCode).toBe(0)
    await expect(
      ws.execute('sleep 5', { signal: AbortSignal.timeout(50) }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(ws.sessionManager.get(ws.sessionManager.defaultId).lastExitCode).toBe(0)
    await ws.close()
  })
})
