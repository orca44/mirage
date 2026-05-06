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
import { BrowserSlackTransport } from './_client_browser.ts'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}

describe('BrowserSlackTransport', () => {
  it('routes to {proxyUrl}/{endpoint} with no auth header by default', async () => {
    let observedUrl = ''
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = (u, init) => {
      observedUrl = (u as URL).href
      observedHeaders = init?.headers
      return Promise.resolve(jsonResponse({ ok: true }))
    }
    const t = new BrowserSlackTransport({ proxyUrl: '/api/slack' })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('users.list')
    expect(observedUrl).toMatch(/\/api\/slack\/users\.list$/)
    const h = new Headers(observedHeaders)
    expect(h.get('Authorization')).toBeNull()
  })

  it('attaches headers from getHeaders() callback', async () => {
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = (_u, init) => {
      observedHeaders = init?.headers
      return Promise.resolve(jsonResponse({ ok: true }))
    }
    const t = new BrowserSlackTransport({
      proxyUrl: '/api/slack',
      getHeaders: () => ({ Authorization: 'Bearer user-jwt', 'X-Workspace': 'w1' }),
    })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('auth.test')
    const h = new Headers(observedHeaders)
    expect(h.get('Authorization')).toBe('Bearer user-jwt')
    expect(h.get('X-Workspace')).toBe('w1')
  })

  it('strips trailing slash from proxyUrl', async () => {
    let observedUrl = ''
    const fakeFetch: typeof fetch = (u) => {
      observedUrl = (u as URL).href
      return Promise.resolve(jsonResponse({ ok: true }))
    }
    const t = new BrowserSlackTransport({ proxyUrl: '/api/slack/' })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('users.list')
    expect(observedUrl).toMatch(/\/api\/slack\/users\.list$/)
  })

  it('awaits async getHeaders()', async () => {
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = (_u, init) => {
      observedHeaders = init?.headers
      return Promise.resolve(jsonResponse({ ok: true }))
    }
    const t = new BrowserSlackTransport({
      proxyUrl: '/api/slack',
      getHeaders: () => Promise.resolve({ Authorization: 'Bearer async-jwt' }),
    })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('auth.test')
    const h = new Headers(observedHeaders)
    expect(h.get('Authorization')).toBe('Bearer async-jwt')
  })

  it('rejects proxyUrl with query string or fragment', () => {
    expect(() => new BrowserSlackTransport({ proxyUrl: '/api/slack?token=x' })).toThrow(
      /query string/,
    )
    expect(() => new BrowserSlackTransport({ proxyUrl: '/api/slack#frag' })).toThrow(/fragment/)
    expect(
      () => new BrowserSlackTransport({ proxyUrl: 'https://example.com/api/slack?x=1' }),
    ).toThrow(/query string/)
  })
})
