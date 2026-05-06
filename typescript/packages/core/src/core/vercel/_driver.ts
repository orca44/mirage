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

export interface VercelUser {
  id: string
  username?: string | null
  email?: string | null
  name?: string | null
  createdAt?: number | null
  avatar?: string | null
}

export interface VercelTeam {
  id: string
  slug?: string | null
  name?: string | null
  createdAt?: number | null
  avatar?: string | null
}

export interface VercelTeamMember {
  uid: string
  username?: string | null
  email?: string | null
  role?: string | null
  createdAt?: number | null
}

export interface VercelProject {
  id: string
  name: string
  accountId?: string | null
  framework?: string | null
  createdAt?: number | null
  updatedAt?: number | null
  link?: { type?: string; repo?: string; org?: string } | null
  latestDeployments?: { uid: string; url?: string; state?: string }[] | null
  targets?: Record<string, unknown> | null
}

export interface VercelDomain {
  name: string
  apexName?: string | null
  projectId?: string | null
  redirect?: string | null
  redirectStatusCode?: number | null
  gitBranch?: string | null
  verified?: boolean | null
  createdAt?: number | null
}

export interface VercelEnvVar {
  id: string
  key: string
  type?: string | null
  target?: string[] | null
  value?: string | null
  configurationId?: string | null
  createdAt?: number | null
  updatedAt?: number | null
}

export interface VercelDeployment {
  uid: string
  name?: string | null
  url?: string | null
  state?: string | null
  type?: string | null
  creator?: { uid: string; email?: string; username?: string } | null
  createdAt?: number | null
  buildingAt?: number | null
  ready?: number | null
  meta?: Record<string, unknown> | null
  target?: string | null
}

export interface VercelDeploymentEvent {
  type?: string | null
  created?: number | null
  payload?: Record<string, unknown> | null
}

export interface VercelListOptions {
  limit?: number
  cursor?: string
}

export interface VercelDriver {
  getUser(): Promise<VercelUser>
  listTeams(options?: VercelListOptions): Promise<{ teams: VercelTeam[] }>
  getTeam(teamId: string): Promise<VercelTeam>
  listTeamMembers(teamId: string): Promise<{ members: VercelTeamMember[] }>
  listProjects(options?: VercelListOptions): Promise<{ projects: VercelProject[] }>
  getProject(projectIdOrName: string): Promise<VercelProject>
  listProjectDomains(projectId: string): Promise<{ domains: VercelDomain[] }>
  listProjectEnv(projectId: string): Promise<{ envs: VercelEnvVar[] }>
  listProjectDeployments(
    projectId: string,
    options?: VercelListOptions,
  ): Promise<{ deployments: VercelDeployment[] }>
  getDeployment(deploymentId: string): Promise<VercelDeployment>
  listDeploymentEvents(deploymentId: string): Promise<VercelDeploymentEvent[]>
  close(): Promise<void>
}
