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

import { GITHUB_API_BASE, GITHUB_API_VERSION, GitHubApiError } from '../github/_client.ts'

export interface CITransport {
  get(path: string, params?: Record<string, string>): Promise<unknown>
  getBytes(path: string): Promise<Uint8Array>
  getPaginated(
    path: string,
    listKey: string,
    params?: Record<string, string>,
    maxResults?: number,
  ): Promise<unknown[]>
}

export class HttpCITransport implements CITransport {
  readonly token: string
  readonly baseUrl: string

  constructor(opts: { token: string; baseUrl?: string }) {
    this.token = opts.token
    this.baseUrl = opts.baseUrl ?? GITHUB_API_BASE
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    }
  }

  async get(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(this.baseUrl + path)
    if (params !== undefined) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    }
    const r = await fetch(url.toString(), { headers: this.headers() })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      throw new GitHubApiError(`GitHub CI ${path} → ${String(r.status)} ${body}`, r.status)
    }
    return r.json()
  }

  async getBytes(path: string): Promise<Uint8Array> {
    const url = new URL(this.baseUrl + path)
    const r = await fetch(url.toString(), { headers: this.headers(), redirect: 'follow' })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      throw new GitHubApiError(`GitHub CI ${path} → ${String(r.status)} ${body}`, r.status)
    }
    const buf = await r.arrayBuffer()
    return new Uint8Array(buf)
  }

  async getPaginated(
    path: string,
    listKey: string,
    params?: Record<string, string>,
    maxResults?: number,
  ): Promise<unknown[]> {
    const perPage = 100
    let page = 1
    const results: unknown[] = []
    for (;;) {
      const url = new URL(this.baseUrl + path)
      if (params !== undefined) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
      }
      url.searchParams.set('per_page', String(perPage))
      url.searchParams.set('page', String(page))
      const r = await fetch(url.toString(), { headers: this.headers() })
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        throw new GitHubApiError(`GitHub CI ${path} → ${String(r.status)} ${body}`, r.status)
      }
      const data = (await r.json()) as Record<string, unknown>
      const batch = (data[listKey] ?? []) as unknown[]
      results.push(...batch)
      if (maxResults !== undefined && results.length >= maxResults) {
        return results.slice(0, maxResults)
      }
      if (batch.length < perPage) break
      page += 1
    }
    return results
  }
}
