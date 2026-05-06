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
import { RAMResource } from '../../../resource/ram/ram.ts'
import { GENERAL_SLEEP } from './sleep.ts'

async function runSleep(arg: string | null): Promise<{ exitCode: number; stderr: string }> {
  const resource = new RAMResource()
  const cmd = GENERAL_SLEEP[0]
  if (cmd === undefined) throw new Error('sleep not registered')
  const texts = arg === null ? [] : [arg]
  const result = await cmd.fn(resource.accessor, [], texts, {
    stdin: null,
    flags: {},
    filetypeFns: null,
    cwd: '/',
    resource,
  })
  if (result === null) return { exitCode: 0, stderr: '' }
  const [, io] = result
  const stderrBytes = io.stderr === null ? new Uint8Array() : (io.stderr as Uint8Array)
  return { exitCode: io.exitCode, stderr: new TextDecoder().decode(stderrBytes) }
}

describe('sleep', () => {
  it('sleeps for the given (short) seconds and exits 0', async () => {
    const t0 = Date.now()
    const r = await runSleep('0.01')
    const elapsed = Date.now() - t0
    expect(r.exitCode).toBe(0)
    expect(elapsed).toBeGreaterThanOrEqual(5)
  })

  it('rejects missing operand with exit 1', async () => {
    const r = await runSleep(null)
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toMatch(/missing operand/)
  })

  it('rejects non-numeric duration with exit 1', async () => {
    const r = await runSleep('abc')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toMatch(/invalid time interval/)
  })

  it('rejects negative duration with exit 1', async () => {
    const r = await runSleep('-1')
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toMatch(/invalid time interval/)
  })
})
