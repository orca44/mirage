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
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { PathSpec } from '../../types.ts'
import {
  getDeployment,
  getProject,
  getTeam,
  getUser,
  listDeploymentEvents,
  listProjectDomains,
  listProjectEnv,
  listTeamMembers,
} from './_client.ts'
import { detectScope } from './scope.ts'

const ENC = new TextEncoder()

function notFound(p: string): Error {
  const err = new Error(p) as Error & { code?: string }
  err.code = 'ENOENT'
  return err
}

function jsonBytes(value: unknown): Uint8Array {
  return ENC.encode(JSON.stringify(value, null, 2) + '\n')
}

function redactEnv(envs: unknown): unknown {
  if (!Array.isArray(envs)) return envs
  return envs.map((e: unknown): unknown => {
    if (typeof e !== 'object' || e === null) return e
    const obj = e as Record<string, unknown>
    if ('value' in obj) return { ...obj, value: '<REDACTED>' }
    return obj
  })
}

export async function read(
  accessor: VercelAccessor,
  path: PathSpec | string,
  _index?: IndexCacheStore,
): Promise<Uint8Array> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const scope = detectScope(spec)

  if (scope.level === 'user_file') return jsonBytes(await getUser(accessor))

  if (scope.level === 'team_file' && scope.teamId !== null) {
    if (scope.filename === 'info.json') return jsonBytes(await getTeam(accessor, scope.teamId))
    if (scope.filename === 'members.json')
      return jsonBytes(await listTeamMembers(accessor, scope.teamId))
  }

  if (scope.level === 'project_file' && scope.projectId !== null) {
    if (scope.filename === 'info.json')
      return jsonBytes(await getProject(accessor, scope.projectId))
    if (scope.filename === 'domains.json')
      return jsonBytes(await listProjectDomains(accessor, scope.projectId))
    if (scope.filename === 'env.json')
      return jsonBytes(redactEnv(await listProjectEnv(accessor, scope.projectId)))
  }

  if (scope.level === 'deployment_file' && scope.deploymentId !== null) {
    if (scope.filename === 'info.json')
      return jsonBytes(await getDeployment(accessor, scope.deploymentId))
    if (scope.filename === 'events.json')
      return jsonBytes(await listDeploymentEvents(accessor, scope.deploymentId))
  }

  throw notFound(spec.original)
}
