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
  VercelDeployment,
  VercelDeploymentEvent,
  VercelDomain,
  VercelDriver,
  VercelEnvVar,
  VercelListOptions,
  VercelProject,
  VercelTeam,
  VercelTeamMember,
  VercelUser,
} from './_driver.ts'

export interface HttpVercelDriverOptions {
  baseUrl?: string
  token?: string | null
  teamId?: string | null
  fetchImpl?: typeof fetch
  headers?: Record<string, string>
}

export class HttpVercelDriver implements VercelDriver {
  readonly baseUrl: string
  private readonly token: string | null
  private readonly teamId: string | null
  private readonly fetchImpl: typeof fetch
  private readonly headers: Record<string, string>

  constructor(options: HttpVercelDriverOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://api.vercel.com'
    this.token = options.token ?? null
    this.teamId = options.teamId ?? null
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis)
    this.headers = options.headers ?? {}
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { ...this.headers }
    if (this.token !== null) h.authorization = `Bearer ${this.token}`
    return h
  }

  private async getJson<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    if (this.teamId !== null) url.searchParams.set('teamId', this.teamId)
    if (params !== undefined) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
    }
    const r = await this.fetchImpl(url.toString(), { headers: this.buildHeaders() })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      throw new Error(`vercel GET ${path} → ${String(r.status)} ${body}`)
    }
    return (await r.json()) as T
  }

  getUser(): Promise<VercelUser> {
    return this.getJson<{ user: VercelUser }>('/v2/user').then((r) => r.user)
  }

  listTeams(options: VercelListOptions = {}): Promise<{ teams: VercelTeam[] }> {
    return this.getJson<{ teams: VercelTeam[] }>('/v2/teams', {
      limit: options.limit,
    })
  }

  getTeam(teamId: string): Promise<VercelTeam> {
    return this.getJson<VercelTeam>(`/v2/teams/${encodeURIComponent(teamId)}`)
  }

  listTeamMembers(teamId: string): Promise<{ members: VercelTeamMember[] }> {
    return this.getJson<{ members: VercelTeamMember[] }>(
      `/v2/teams/${encodeURIComponent(teamId)}/members`,
    )
  }

  listProjects(options: VercelListOptions = {}): Promise<{ projects: VercelProject[] }> {
    return this.getJson<{ projects: VercelProject[] }>('/v9/projects', {
      limit: options.limit,
    })
  }

  getProject(projectIdOrName: string): Promise<VercelProject> {
    return this.getJson<VercelProject>(`/v9/projects/${encodeURIComponent(projectIdOrName)}`)
  }

  async listProjectDomains(projectId: string): Promise<{ domains: VercelDomain[] }> {
    return this.getJson<{ domains: VercelDomain[] }>(
      `/v9/projects/${encodeURIComponent(projectId)}/domains`,
    )
  }

  async listProjectEnv(projectId: string): Promise<{ envs: VercelEnvVar[] }> {
    return this.getJson<{ envs: VercelEnvVar[] }>(
      `/v9/projects/${encodeURIComponent(projectId)}/env`,
    )
  }

  listProjectDeployments(
    projectId: string,
    options: VercelListOptions = {},
  ): Promise<{ deployments: VercelDeployment[] }> {
    return this.getJson<{ deployments: VercelDeployment[] }>('/v6/deployments', {
      projectId,
      limit: options.limit,
    })
  }

  getDeployment(deploymentId: string): Promise<VercelDeployment> {
    return this.getJson<VercelDeployment>(`/v13/deployments/${encodeURIComponent(deploymentId)}`)
  }

  listDeploymentEvents(deploymentId: string): Promise<VercelDeploymentEvent[]> {
    return this.getJson<VercelDeploymentEvent[]>(
      `/v3/deployments/${encodeURIComponent(deploymentId)}/events`,
    )
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}
