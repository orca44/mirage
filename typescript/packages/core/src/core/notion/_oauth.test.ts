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

import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { describe, expect, it } from 'vitest'
import { MemoryOAuthClientProvider } from './_oauth.ts'

const baseMetadata: OAuthClientMetadata = {
  redirect_uris: ['https://example.com/callback'],
  client_name: 'mirage-notion-test',
}

function makeProvider(opts?: {
  redirect?: (url: URL) => void | Promise<void>
  redirectUrl?: string | URL
  metadata?: OAuthClientMetadata
}): {
  provider: MemoryOAuthClientProvider
  redirects: URL[]
} {
  const redirects: URL[] = []
  const providerOpts: ConstructorParameters<typeof MemoryOAuthClientProvider>[0] = {
    clientMetadata: opts?.metadata ?? baseMetadata,
    redirect:
      opts?.redirect ??
      ((url: URL) => {
        redirects.push(url)
      }),
  }
  if (opts?.redirectUrl !== undefined) {
    providerOpts.redirectUrl = opts.redirectUrl
  }
  const provider = new MemoryOAuthClientProvider(providerOpts)
  return { provider, redirects }
}

describe('MemoryOAuthClientProvider', () => {
  it('tokens() returns undefined initially and the saved tokens after saveTokens()', () => {
    const { provider } = makeProvider()
    expect(provider.tokens()).toBeUndefined()
    const tokens: OAuthTokens = { access_token: 'x', token_type: 'Bearer' }
    provider.saveTokens(tokens)
    expect(provider.tokens()).toEqual(tokens)
  })

  it('clearTokens() resets tokens back to undefined', () => {
    const { provider } = makeProvider()
    provider.saveTokens({ access_token: 'x', token_type: 'Bearer' })
    provider.clearTokens()
    expect(provider.tokens()).toBeUndefined()
  })

  it('redirectToAuthorization() invokes the redirect callback exactly once with the URL', async () => {
    const { provider, redirects } = makeProvider()
    const url = new URL('https://example.com/authorize')
    await provider.redirectToAuthorization(url)
    expect(redirects).toHaveLength(1)
    expect(redirects[0]).toBe(url)
  })

  it('clientInformation() returns undefined initially and the saved info after saveClientInformation()', () => {
    const { provider } = makeProvider()
    expect(provider.clientInformation()).toBeUndefined()
    const info = { client_id: 'abc' } as unknown as OAuthClientInformationMixed
    provider.saveClientInformation(info)
    expect(provider.clientInformation()).toEqual(info)
  })

  it('codeVerifier() returns the saved verifier after saveCodeVerifier()', () => {
    const { provider } = makeProvider()
    provider.saveCodeVerifier('verifier-x')
    expect(provider.codeVerifier()).toBe('verifier-x')
  })

  it('codeVerifier() throws an error containing "no code verifier" before any save', () => {
    const { provider } = makeProvider()
    expect(() => provider.codeVerifier()).toThrowError(/no code verifier/)
  })

  it('clientMetadata getter returns the metadata passed in the constructor', () => {
    const metadata: OAuthClientMetadata = {
      redirect_uris: ['https://example.com/cb'],
      client_name: 'custom-name',
    }
    const { provider } = makeProvider({ metadata })
    expect(provider.clientMetadata).toBe(metadata)
  })

  it('redirectUrl getter returns opts.redirectUrl when provided, undefined otherwise', () => {
    const { provider: noUrl } = makeProvider()
    expect(noUrl.redirectUrl).toBeUndefined()
    const customUrl = 'https://example.com/redirect'
    const { provider: withUrl } = makeProvider({ redirectUrl: customUrl })
    expect(withUrl.redirectUrl).toBe(customUrl)
  })
})
