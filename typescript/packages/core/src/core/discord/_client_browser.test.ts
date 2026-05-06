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

import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserDiscordTransport } from './_client_browser.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('BrowserDiscordTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('proxyUrl with absolute URL strips trailing slash', async () => {
    let observedUrl = ''
    const fakeFetch: typeof fetch = (u) => {
      observedUrl = u instanceof URL ? u.toString() : typeof u === 'string' ? u : u.url
      return Promise.resolve(jsonResponse([]))
    }
    const t = new BrowserDiscordTransport({ proxyUrl: 'https://example.com/api/discord/' })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('GET', '/users/@me/guilds')
    expect(observedUrl).toBe('https://example.com/api/discord/users/@me/guilds')
  })

  it('proxyUrl with relative path resolves against globalThis.location.origin', async () => {
    vi.stubGlobal('location', { origin: 'http://example.com' })
    let observedUrl = ''
    const fakeFetch: typeof fetch = (u) => {
      observedUrl = u instanceof URL ? u.toString() : typeof u === 'string' ? u : u.url
      return Promise.resolve(jsonResponse([]))
    }
    const t = new BrowserDiscordTransport({ proxyUrl: '/api/discord' })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('GET', '/users/@me/guilds')
    expect(observedUrl).toBe('http://example.com/api/discord/users/@me/guilds')
  })

  it('proxyUrl with query string throws', () => {
    expect(() => new BrowserDiscordTransport({ proxyUrl: '/api/discord?token=x' })).toThrow(
      /query string/,
    )
    expect(
      () => new BrowserDiscordTransport({ proxyUrl: 'https://example.com/api/discord?x=1' }),
    ).toThrow(/query string/)
  })

  it('proxyUrl with fragment throws', () => {
    expect(() => new BrowserDiscordTransport({ proxyUrl: '/api/discord#hash' })).toThrow(/fragment/)
  })

  it('getHeaders undefined → empty headers (no Authorization)', async () => {
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = (_u, init) => {
      observedHeaders = init?.headers
      return Promise.resolve(jsonResponse([]))
    }
    const t = new BrowserDiscordTransport({ proxyUrl: 'https://example.com/api/discord' })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('GET', '/users/@me/guilds')
    const h = new Headers(observedHeaders)
    expect(h.get('Authorization')).toBeNull()
  })

  it('getHeaders sync → returned headers passed through', async () => {
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = (_u, init) => {
      observedHeaders = init?.headers
      return Promise.resolve(jsonResponse([]))
    }
    const t = new BrowserDiscordTransport({
      proxyUrl: 'https://example.com/api/discord',
      getHeaders: () => ({ 'X-Auth': 'k' }),
    })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('GET', '/users/@me/guilds')
    const h = new Headers(observedHeaders)
    expect(h.get('X-Auth')).toBe('k')
  })

  it('getHeaders async → awaited', async () => {
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = (_u, init) => {
      observedHeaders = init?.headers
      return Promise.resolve(jsonResponse([]))
    }
    const t = new BrowserDiscordTransport({
      proxyUrl: 'https://example.com/api/discord',
      getHeaders: () => Promise.resolve({ 'X-Auth': 'k' }),
    })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('GET', '/users/@me/guilds')
    const h = new Headers(observedHeaders)
    expect(h.get('X-Auth')).toBe('k')
  })

  it('Authorization header from getHeaders is forwarded to fetch', async () => {
    let observedHeaders: HeadersInit | undefined
    const fakeFetch: typeof fetch = (_u, init) => {
      observedHeaders = init?.headers
      return Promise.resolve(jsonResponse([]))
    }
    vi.stubGlobal('fetch', fakeFetch)
    const t = new BrowserDiscordTransport({
      proxyUrl: 'https://example.com/api/discord',
      getHeaders: () => ({ Authorization: 'Proxy x' }),
    })
    ;(t as unknown as { fetch: typeof fetch }).fetch = fakeFetch
    await t.call('GET', '/users/@me/guilds')
    const h = new Headers(observedHeaders)
    expect(h.get('Authorization')).toBe('Proxy x')
  })
})
