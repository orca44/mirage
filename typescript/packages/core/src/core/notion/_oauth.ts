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

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'

export interface MemoryOAuthClientProviderOptions {
  clientMetadata: OAuthClientMetadata
  redirect: (url: URL) => void | Promise<void>
  redirectUrl?: string | URL
}

export class MemoryOAuthClientProvider implements OAuthClientProvider {
  private readonly opts: MemoryOAuthClientProviderOptions
  private _clientInformation: OAuthClientInformationMixed | undefined
  private _tokens: OAuthTokens | undefined
  private _codeVerifier: string | undefined

  constructor(opts: MemoryOAuthClientProviderOptions) {
    this.opts = opts
  }

  get redirectUrl(): string | URL | undefined {
    return this.opts.redirectUrl
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.opts.clientMetadata
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this._clientInformation
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    this._clientInformation = info
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens
  }

  redirectToAuthorization(authorizationUrl: URL): void | Promise<void> {
    return this.opts.redirect(authorizationUrl)
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier
  }

  codeVerifier(): string {
    if (this._codeVerifier === undefined) {
      throw new Error('no code verifier saved')
    }
    return this._codeVerifier
  }

  clearTokens(): void {
    this._tokens = undefined
  }
}
