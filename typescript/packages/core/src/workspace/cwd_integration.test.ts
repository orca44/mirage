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

// Direct port of tests/workspace/test_cwd_integration.py.
// Exercises cwd tracking + `cd`/`pwd`/`ls` across quoting/escaping of
// paths that contain spaces and apostrophes.

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

async function makeWsSpecial(): Promise<Workspace> {
  const parser = await getTestParser()
  const r = new RAMResource()
  r.store.dirs.add('/')
  r.store.dirs.add("/Zecheng's Server")
  r.store.files.set("/Zecheng's Server/image.png", ENC.encode('PNG'))

  const registry = new OpsRegistry()
  registry.registerResource(r)
  return new Workspace(
    { '/ram/': r },
    { mode: MountMode.WRITE, ops: registry, shellParser: parser },
  )
}

async function runOut(ws: Workspace, cmd: string): Promise<string> {
  const io = await ws.execute(cmd)
  return stdoutStr(io)
}

describe('cwd integration (port of tests/workspace/test_cwd_integration.py)', () => {
  it('pwd default → non-empty stdout', async () => {
    const ws = await makeWs()
    const out = await runOut(ws, 'pwd')
    expect(out.trim()).not.toBe('')
    await ws.close()
  })

  it('cd /ram && pwd → /ram', async () => {
    const ws = await makeWs()
    expect((await runOut(ws, 'cd /ram && pwd')).trim()).toBe('/ram')
    await ws.close()
  })

  it('cd /ram/subdir && pwd → /ram/subdir', async () => {
    const ws = await makeWs()
    expect((await runOut(ws, 'cd /ram/subdir && pwd')).trim()).toBe('/ram/subdir')
    await ws.close()
  })

  it('cd /ram/subdir && cd .. && pwd → /ram', async () => {
    const ws = await makeWs()
    expect((await runOut(ws, 'cd /ram/subdir && cd .. && pwd')).trim()).toBe('/ram')
    await ws.close()
  })

  it('cd /ram/subdir && cd / && pwd → /', async () => {
    const ws = await makeWs()
    expect((await runOut(ws, 'cd /ram/subdir && cd / && pwd')).trim()).toBe('/')
    await ws.close()
  })

  it('cd /ram/subdir && cd ~ && pwd → /', async () => {
    const ws = await makeWs()
    expect((await runOut(ws, 'cd /ram/subdir && cd ~ && pwd')).trim()).toBe('/')
    await ws.close()
  })

  it('cd /ram/subdir && cd && pwd → / (bare cd)', async () => {
    const ws = await makeWs()
    expect((await runOut(ws, 'cd /ram/subdir && cd && pwd')).trim()).toBe('/')
    await ws.close()
  })

  it('cd /ram && cd subdir && pwd → /ram/subdir (relative)', async () => {
    const ws = await makeWs()
    expect((await runOut(ws, 'cd /ram && cd subdir && pwd')).trim()).toBe('/ram/subdir')
    await ws.close()
  })

  it('cd /ram/subdir && ls → includes file.txt', async () => {
    const ws = await makeWs()
    expect(await runOut(ws, 'cd /ram/subdir && ls')).toContain('file.txt')
    await ws.close()
  })

  it('cd /ram && ls → includes subdir', async () => {
    const ws = await makeWs()
    expect(await runOut(ws, 'cd /ram && ls')).toContain('subdir')
    await ws.close()
  })

  it('cd /ram/subdir && cd nested && pwd → /ram/subdir/nested', async () => {
    const ws = await makeWs()
    expect((await runOut(ws, 'cd /ram/subdir && cd nested && pwd')).trim()).toBe(
      '/ram/subdir/nested',
    )
    await ws.close()
  })

  it('cd /ram/subdir/nested && cd ../.. && pwd → /ram', async () => {
    const ws = await makeWs()
    expect((await runOut(ws, 'cd /ram/subdir/nested && cd ../.. && pwd')).trim()).toBe('/ram')
    await ws.close()
  })

  it("ls with backslash-escaped path: ls /ram/Zecheng\\'s\\ Server/", async () => {
    const ws = await makeWsSpecial()
    expect(await runOut(ws, "ls /ram/Zecheng\\'s\\ Server/")).toContain('image.png')
    await ws.close()
  })

  it('ls with double-quoted path containing apostrophe + space', async () => {
    const ws = await makeWsSpecial()
    expect(await runOut(ws, 'ls "/ram/Zecheng\'s Server/"')).toContain('image.png')
    await ws.close()
  })

  it('cd backslash-escaped && ls → includes image.png', async () => {
    const ws = await makeWsSpecial()
    expect(await runOut(ws, "cd /ram/Zecheng\\'s\\ Server && ls")).toContain('image.png')
    await ws.close()
  })

  it('cd double-quoted && ls → includes image.png', async () => {
    const ws = await makeWsSpecial()
    expect(await runOut(ws, 'cd "/ram/Zecheng\'s Server" && ls')).toContain('image.png')
    await ws.close()
  })

  it("cd backslash-escaped && pwd → /ram/Zecheng's Server", async () => {
    const ws = await makeWsSpecial()
    expect((await runOut(ws, "cd /ram/Zecheng\\'s\\ Server && pwd")).trim()).toBe(
      "/ram/Zecheng's Server",
    )
    await ws.close()
  })
})
