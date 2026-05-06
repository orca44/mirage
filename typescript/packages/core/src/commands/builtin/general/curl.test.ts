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
import { GENERAL_CURL } from './curl.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder()

interface FetchCall {
  url: string
  init?: RequestInit
}

function mockFetch(respBody: string, status = 200): FetchCall[] {
  const calls: FetchCall[] = []
  globalThis.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    calls.push({ url: urlStr, ...(init !== undefined ? { init } : {}) })
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(ENC.encode(respBody).buffer),
      text: () => Promise.resolve(respBody),
      headers: new Headers(),
    } as unknown as Response)
  }) as typeof fetch
  return calls
}

async function runCurl(
  texts: string[],
  flags: Record<string, string | boolean> = {},
): Promise<{
  out: string
  exitCode: number
  writes: Record<string, Uint8Array | AsyncIterable<Uint8Array>>
}> {
  const resource = new RAMResource()
  const cmd = GENERAL_CURL[0]
  if (cmd === undefined) throw new Error('curl not registered')
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

describe('curl', () => {
  const original = globalThis.fetch
  beforeEach(() => {
    mockFetch('hello body')
  })
  afterEach(() => {
    globalThis.fetch = original
  })

  it('GET returns body', async () => {
    const r = await runCurl(['https://x.test/hi'])
    expect(r.out).toBe('hello body')
    expect(r.exitCode).toBe(0)
  })

  it('-o writes to file instead of stdout', async () => {
    const r = await runCurl(['https://x.test/file'], { o: '/tmp/out.txt' })
    const written = r.writes['/tmp/out.txt']
    expect(written).toBeInstanceOf(Uint8Array)
    if (written instanceof Uint8Array) {
      expect(DEC.decode(written)).toBe('hello body')
    }
    expect(r.out).toContain('saved to /tmp/out.txt')
  })

  it('-s with -o silences stdout', async () => {
    const r = await runCurl(['https://x.test/x'], { o: '/tmp/o', s: true })
    expect(r.out).toBe('')
  })

  it('-X POST -d sends body', async () => {
    const calls = mockFetch('ok')
    const r = await runCurl(['https://x.test/p'], { X: 'POST', d: 'payload' })
    expect(r.exitCode).toBe(0)
    expect(calls[0]?.init?.method).toBe('POST')
    expect(new TextDecoder().decode(calls[0]?.init?.body as ArrayBuffer)).toBe('payload')
  })

  it('-H adds headers', async () => {
    const calls = mockFetch('ok')
    await runCurl(['https://x.test/p'], { H: 'X-Auth: token' })
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['X-Auth']).toBe('token')
  })

  it('sends default Mozilla User-Agent when none provided', async () => {
    const calls = mockFetch('ok')
    await runCurl(['https://x.test/p'])
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['User-Agent']).toMatch(/^Mozilla\/5\.0/)
  })

  it('-A overrides default User-Agent', async () => {
    const calls = mockFetch('ok')
    await runCurl(['https://x.test/p'], { A: 'my-agent/9' })
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('my-agent/9')
  })

  it('-H User-Agent overrides default', async () => {
    const calls = mockFetch('ok')
    await runCurl(['https://x.test/p'], { H: 'User-Agent: from-H/1' })
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('from-H/1')
  })

  it('missing URL returns exit 1', async () => {
    const r = await runCurl([])
    expect(r.exitCode).toBe(1)
  })
})
