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

import type { VercelAccessor } from '../../accessor/vercel.ts'
import type {
  VercelDeployment,
  VercelDeploymentEvent,
  VercelDomain,
  VercelEnvVar,
  VercelProject,
  VercelTeam,
  VercelTeamMember,
  VercelUser,
} from './_driver.ts'

export async function getUser(accessor: VercelAccessor): Promise<VercelUser> {
  return accessor.driver.getUser()
}

export async function listTeams(accessor: VercelAccessor): Promise<VercelTeam[]> {
  const r = await accessor.driver.listTeams({ limit: accessor.config.defaultListLimit })
  return r.teams
}

export async function getTeam(accessor: VercelAccessor, teamId: string): Promise<VercelTeam> {
  return accessor.driver.getTeam(teamId)
}

export async function listTeamMembers(
  accessor: VercelAccessor,
  teamId: string,
): Promise<VercelTeamMember[]> {
  const r = await accessor.driver.listTeamMembers(teamId)
  return r.members
}

export async function listProjects(accessor: VercelAccessor): Promise<VercelProject[]> {
  const r = await accessor.driver.listProjects({ limit: accessor.config.defaultListLimit })
  return r.projects
}

export async function getProject(
  accessor: VercelAccessor,
  projectIdOrName: string,
): Promise<VercelProject> {
  return accessor.driver.getProject(projectIdOrName)
}

export async function listProjectDomains(
  accessor: VercelAccessor,
  projectId: string,
): Promise<VercelDomain[]> {
  const r = await accessor.driver.listProjectDomains(projectId)
  return r.domains
}

export async function listProjectEnv(
  accessor: VercelAccessor,
  projectId: string,
): Promise<VercelEnvVar[]> {
  const r = await accessor.driver.listProjectEnv(projectId)
  return r.envs
}

export async function listProjectDeployments(
  accessor: VercelAccessor,
  projectId: string,
): Promise<VercelDeployment[]> {
  const r = await accessor.driver.listProjectDeployments(projectId, {
    limit: accessor.config.defaultListLimit,
  })
  return r.deployments
}

export async function getDeployment(
  accessor: VercelAccessor,
  deploymentId: string,
): Promise<VercelDeployment> {
  return accessor.driver.getDeployment(deploymentId)
}

export async function listDeploymentEvents(
  accessor: VercelAccessor,
  deploymentId: string,
): Promise<VercelDeploymentEvent[]> {
  return accessor.driver.listDeploymentEvents(deploymentId)
}
