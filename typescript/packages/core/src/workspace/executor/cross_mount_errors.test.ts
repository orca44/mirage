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
import { OpsRegistry } from '../../ops/registry.ts'
import { RAMResource } from '../../resource/ram/ram.ts'
import { MountMode } from '../../types.ts'
import { getTestParser, stderrStr, stdoutStr } from '../fixtures/workspace_fixture.ts'
import { Workspace } from '../workspace.ts'

// Direct port of tests/workspace/test_cross_mount_errors.py.
// Exercises error paths for cross-mount head/tail — cross_mount.test.ts
// only covers the happy path with mocked dispatch.

const ENC = new TextEncoder()

async function makeTwoRamWs(): Promise<Workspace> {
  const parser = await getTestParser()
  const ram1 = new RAMResource()
  const ram2 = new RAMResource()
  ram1.store.files.set('/file.txt', ENC.encode('line1\nline2\nline3\nline4\nline5\n'))
  ram2.store.files.set('/file.txt', ENC.encode('aaa\nbbb\nccc\n'))

  const registry = new OpsRegistry()
  registry.registerResource(ram1)
  registry.registerResource(ram2)

  return new Workspace(
    { '/a': ram1, '/b': ram2 },
    { mode: MountMode.WRITE, ops: registry, shellParser: parser },
  )
}

async function runCmd(
  ws: Workspace,
  cmd: string,
): Promise<{ out: string; err: string; code: number }> {
  const io = await ws.execute(cmd)
  return { out: stdoutStr(io), err: stderrStr(io), code: io.exitCode }
}

describe('cross-mount errors (port of tests/workspace/test_cross_mount_errors.py)', () => {
  it('head -n abc across two mounts → exit 1, "invalid number" with "abc"', async () => {
    const ws = await makeTwoRamWs()
    const r = await runCmd(ws, 'head -n abc /a/file.txt /b/file.txt')
    expect(r.code).toBe(1)
    expect(r.err).toContain('invalid number')
    expect(r.err).toContain('abc')
    await ws.close()
  })

  it('tail -n abc across two mounts → exit 1, "invalid number" with "abc"', async () => {
    const ws = await makeTwoRamWs()
    const r = await runCmd(ws, 'tail -n abc /a/file.txt /b/file.txt')
    expect(r.code).toBe(1)
    expect(r.err).toContain('invalid number')
    expect(r.err).toContain('abc')
    await ws.close()
  })

  it('head -n 2 across two mounts → exit 0, first 2 lines of each', async () => {
    const ws = await makeTwoRamWs()
    const r = await runCmd(ws, 'head -n 2 /a/file.txt /b/file.txt')
    expect(r.code).toBe(0)
    expect(r.out).toContain('line1')
    expect(r.out).toContain('line2')
    expect(r.out).toContain('aaa')
    expect(r.out).toContain('bbb')
    await ws.close()
  })

  it('tail -n 1 across two mounts → exit 0, last line of each', async () => {
    const ws = await makeTwoRamWs()
    const r = await runCmd(ws, 'tail -n 1 /a/file.txt /b/file.txt')
    expect(r.code).toBe(0)
    expect(r.out).toContain('line5')
    expect(r.out).toContain('ccc')
    await ws.close()
  })

  it('head default -n across two mounts → exit 0, includes first lines', async () => {
    const ws = await makeTwoRamWs()
    const r = await runCmd(ws, 'head /a/file.txt /b/file.txt')
    expect(r.code).toBe(0)
    expect(r.out).toContain('line1')
    expect(r.out).toContain('aaa')
    await ws.close()
  })
})
