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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { materialize } from '../../../io/types.ts'
import { RAMResource } from '../../../resource/ram/ram.ts'
import { GENERAL_WGET } from './wget.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder()

function mockFetch(respBody: string, status = 200): void {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(ENC.encode(respBody).buffer),
      headers: new Headers(),
    } as unknown as Response),
  ) as typeof fetch
}

async function runWget(
  texts: string[],
  flags: Record<string, string | boolean> = {},
): Promise<{
  out: string
  exitCode: number
  writes: Record<string, Uint8Array | AsyncIterable<Uint8Array>>
}> {
  const resource = new RAMResource()
  const cmd = GENERAL_WGET[0]
  if (cmd === undefined) throw new Error('wget not registered')
  const result = await cmd.fn((resource as { accessor?: unknown }).accessor as never, [], texts, {
    stdin: null,
    flags,
    filetypeFns: null,
    cwd: '/',
    resource,
  })
  if (result === null) return { out: '', exitCode: -1, writes: {} }
  const [out, ioResult] = result
  const buf =
    out === null
      ? new Uint8Array()
      : out instanceof Uint8Array
        ? out
        : await materialize(out as AsyncIterable<Uint8Array>)
  return { out: DEC.decode(buf), exitCode: ioResult.exitCode, writes: ioResult.writes }
}

describe('wget', () => {
  const original = globalThis.fetch
  beforeEach(() => {
    mockFetch('file-body')
  })
  afterEach(() => {
    globalThis.fetch = original
  })

  it('saves URL basename by default', async () => {
    const r = await runWget(['https://x.test/path/doc.pdf'])
    expect(r.writes['doc.pdf']).toBeInstanceOf(Uint8Array)
    expect(r.out).toContain('saved 9 bytes to doc.pdf')
  })

  it('-O specifies destination', async () => {
    const r = await runWget(['https://x.test/file'], { O: '/tmp/dest.bin' })
    const written = r.writes['/tmp/dest.bin']
    expect(written).toBeInstanceOf(Uint8Array)
    if (written instanceof Uint8Array) {
      expect(DEC.decode(written)).toBe('file-body')
    }
  })

  it('-q suppresses stdout', async () => {
    const r = await runWget(['https://x.test/a.txt'], { q: true })
    expect(r.out).toBe('')
  })

  it('--spider checks without saving', async () => {
    const r = await runWget(['https://x.test/exists'], { spider: true })
    expect(Object.keys(r.writes)).toHaveLength(0)
    expect(r.out).toMatch(/Spider mode:.*exists \(9 bytes\)/)
  })

  it('missing URL returns exit 1', async () => {
    const r = await runWget([])
    expect(r.exitCode).toBe(1)
  })
})
