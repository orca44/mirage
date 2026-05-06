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
  SSCholarDriver,
  SSCholarPaper,
  SSCholarSearchOptions,
  SSCholarSearchResult,
  SSCholarSnippetSearchResult,
} from './_driver.ts'
import type {
  SSCholarAuthorPapersOptions,
  SSCholarAuthorPapersResult,
  SSCholarAuthorProfile,
  SSCholarAuthorSearchResult,
} from './author_driver.ts'

export interface HttpSSCholarDriverOptions {
  baseUrl?: string
  apiKey?: string | null
  fetchImpl?: typeof fetch
  headers?: Record<string, string>
}

export class HttpSSCholarDriver implements SSCholarDriver {
  readonly baseUrl: string
  private readonly apiKey: string | null
  private readonly fetchImpl: typeof fetch
  private readonly headers: Record<string, string>

  constructor(options: HttpSSCholarDriverOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://api.semanticscholar.org'
    this.apiKey = options.apiKey ?? null
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
    this.headers = options.headers ?? {}
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { ...this.headers }
    if (this.apiKey !== null) h['x-api-key'] = this.apiKey
    return h
  }

  private async getJson<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params !== undefined) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
    }
    const r = await this.fetchImpl(url.toString(), { headers: this.buildHeaders() })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      throw new Error(`sscholar GET ${path} → ${String(r.status)} ${body}`)
    }
    return (await r.json()) as T
  }

  async getPaper(paperId: string, fields?: readonly string[]): Promise<SSCholarPaper> {
    const params: Record<string, string> = {}
    if (fields !== undefined && fields.length > 0) params.fields = fields.join(',')
    return this.getJson<SSCholarPaper>(`/graph/v1/paper/${encodeURIComponent(paperId)}`, params)
  }

  async searchPapers(options: SSCholarSearchOptions): Promise<SSCholarSearchResult> {
    const params: Record<string, string | number | undefined> = {
      limit: options.limit,
      offset: options.offset,
      sort: options.sort,
      year: options.year !== undefined ? String(options.year) : undefined,
      fieldsOfStudy: options.fieldsOfStudy,
      query: options.query ?? '*',
    }
    if (options.fields !== undefined && options.fields.length > 0) {
      params.fields = options.fields.join(',')
    }
    return this.getJson<SSCholarSearchResult>('/graph/v1/paper/search', params)
  }

  async searchSnippets(query: string, limit = 10): Promise<SSCholarSnippetSearchResult> {
    return this.getJson<SSCholarSnippetSearchResult>('/graph/v1/snippet/search', {
      query,
      limit,
    })
  }

  async getAuthor(authorId: string, fields?: readonly string[]): Promise<SSCholarAuthorProfile> {
    const params: Record<string, string> = {}
    if (fields !== undefined && fields.length > 0) params.fields = fields.join(',')
    return this.getJson<SSCholarAuthorProfile>(
      `/graph/v1/author/${encodeURIComponent(authorId)}`,
      params,
    )
  }

  async getAuthorPapers(
    authorId: string,
    options: SSCholarAuthorPapersOptions = {},
  ): Promise<SSCholarAuthorPapersResult> {
    const params: Record<string, string | number | undefined> = {
      limit: options.limit,
      offset: options.offset,
    }
    if (options.fields !== undefined && options.fields.length > 0) {
      params.fields = options.fields.join(',')
    }
    return this.getJson<SSCholarAuthorPapersResult>(
      `/graph/v1/author/${encodeURIComponent(authorId)}/papers`,
      params,
    )
  }

  async searchAuthors(
    query: string,
    limit = 10,
    fields?: readonly string[],
  ): Promise<SSCholarAuthorSearchResult> {
    const params: Record<string, string | number | undefined> = { query, limit }
    if (fields !== undefined && fields.length > 0) params.fields = fields.join(',')
    return this.getJson<SSCholarAuthorSearchResult>('/graph/v1/author/search', params)
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}
