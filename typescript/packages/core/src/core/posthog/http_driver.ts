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

import type { PostHogDriver, PostHogPaged, PostHogProject, PostHogUser } from './_driver.ts'

export interface HttpPostHogDriverOptions {
  baseUrl?: string
  apiKey?: string | null
  fetchImpl?: typeof fetch
  headers?: Record<string, string>
}

export class HttpPostHogDriver implements PostHogDriver {
  readonly baseUrl: string
  private readonly apiKey: string | null
  private readonly fetchImpl: typeof fetch
  private readonly headers: Record<string, string>

  constructor(options: HttpPostHogDriverOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://us.posthog.com'
    this.apiKey = options.apiKey ?? null
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
    this.headers = options.headers ?? {}
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { ...this.headers }
    if (this.apiKey !== null) h.authorization = `Bearer ${this.apiKey}`
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
      throw new Error(`posthog GET ${path} → ${String(r.status)} ${body}`)
    }
    return (await r.json()) as T
  }

  getUser(): Promise<PostHogUser> {
    return this.getJson<PostHogUser>('/api/users/@me/')
  }

  async listProjects(): Promise<PostHogProject[]> {
    const r = await this.getJson<PostHogPaged<PostHogProject>>('/api/projects/')
    return r.results
  }

  getProject(projectId: number | string): Promise<PostHogProject> {
    return this.getJson<PostHogProject>(`/api/projects/${encodeURIComponent(String(projectId))}/`)
  }

  listFeatureFlags(projectId: number | string, limit = 100): Promise<PostHogPaged<unknown>> {
    return this.getJson<PostHogPaged<unknown>>(
      `/api/projects/${encodeURIComponent(String(projectId))}/feature_flags/`,
      { limit },
    )
  }

  listCohorts(projectId: number | string, limit = 100): Promise<PostHogPaged<unknown>> {
    return this.getJson<PostHogPaged<unknown>>(
      `/api/projects/${encodeURIComponent(String(projectId))}/cohorts/`,
      { limit },
    )
  }

  listDashboards(projectId: number | string, limit = 100): Promise<PostHogPaged<unknown>> {
    return this.getJson<PostHogPaged<unknown>>(
      `/api/projects/${encodeURIComponent(String(projectId))}/dashboards/`,
      { limit },
    )
  }

  listInsights(projectId: number | string, limit = 100): Promise<PostHogPaged<unknown>> {
    return this.getJson<PostHogPaged<unknown>>(
      `/api/projects/${encodeURIComponent(String(projectId))}/insights/`,
      { limit },
    )
  }

  listPersons(projectId: number | string, limit = 100): Promise<PostHogPaged<unknown>> {
    return this.getJson<PostHogPaged<unknown>>(
      `/api/projects/${encodeURIComponent(String(projectId))}/persons/`,
      { limit },
    )
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}
