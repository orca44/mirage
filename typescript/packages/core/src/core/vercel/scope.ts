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

import { PathSpec } from '../../types.ts'

export type VercelLevel =
  | 'root'
  | 'user_file'
  | 'teams_dir'
  | 'team_dir'
  | 'team_file'
  | 'projects_dir'
  | 'project_dir'
  | 'project_file'
  | 'deployments_dir'
  | 'deployment_dir'
  | 'deployment_file'
  | 'invalid'

export interface VercelScope {
  level: VercelLevel
  teamId: string | null
  projectId: string | null
  deploymentId: string | null
  filename: string | null
  resourcePath: string
}

export const ROOT_ENTRIES: readonly string[] = Object.freeze(['user.json', 'teams', 'projects'])
export const TEAM_FILES: readonly string[] = Object.freeze(['info.json', 'members.json'])
export const PROJECT_FILES: readonly string[] = Object.freeze([
  'info.json',
  'domains.json',
  'env.json',
])
export const PROJECT_SUBDIRS: readonly string[] = Object.freeze(['deployments'])
export const DEPLOYMENT_FILES: readonly string[] = Object.freeze(['info.json', 'events.json'])

export function detectScope(path: PathSpec | string): VercelScope {
  const raw = path instanceof PathSpec ? path.stripPrefix : path
  const key = raw.replace(/^\/+|\/+$/g, '')
  const empty: VercelScope = {
    level: 'root',
    teamId: null,
    projectId: null,
    deploymentId: null,
    filename: null,
    resourcePath: '/',
  }
  if (key === '') return empty

  const parts = key.split('/')
  const head = parts[0] ?? ''

  if (head === 'user.json' && parts.length === 1) {
    return { ...empty, level: 'user_file', filename: 'user.json', resourcePath: raw }
  }

  if (head === 'teams') {
    if (parts.length === 1) return { ...empty, level: 'teams_dir', resourcePath: raw }
    const teamId = parts[1] ?? ''
    if (parts.length === 2) {
      return { ...empty, level: 'team_dir', teamId, resourcePath: raw }
    }
    if (parts.length === 3) {
      const filename = parts[2] ?? ''
      if (!TEAM_FILES.includes(filename)) {
        return { ...empty, level: 'invalid', resourcePath: raw }
      }
      return { ...empty, level: 'team_file', teamId, filename, resourcePath: raw }
    }
    return { ...empty, level: 'invalid', resourcePath: raw }
  }

  if (head === 'projects') {
    if (parts.length === 1) return { ...empty, level: 'projects_dir', resourcePath: raw }
    const projectId = parts[1] ?? ''
    if (parts.length === 2) {
      return { ...empty, level: 'project_dir', projectId, resourcePath: raw }
    }
    const sub = parts[2] ?? ''
    if (parts.length === 3) {
      if (PROJECT_FILES.includes(sub)) {
        return {
          ...empty,
          level: 'project_file',
          projectId,
          filename: sub,
          resourcePath: raw,
        }
      }
      if (sub === 'deployments') {
        return { ...empty, level: 'deployments_dir', projectId, resourcePath: raw }
      }
      return { ...empty, level: 'invalid', resourcePath: raw }
    }
    if (parts.length === 4 && sub === 'deployments') {
      const deploymentId = parts[3] ?? ''
      return {
        ...empty,
        level: 'deployment_dir',
        projectId,
        deploymentId,
        resourcePath: raw,
      }
    }
    if (parts.length === 5 && sub === 'deployments') {
      const deploymentId = parts[3] ?? ''
      const filename = parts[4] ?? ''
      if (!DEPLOYMENT_FILES.includes(filename)) {
        return { ...empty, level: 'invalid', resourcePath: raw }
      }
      return {
        ...empty,
        level: 'deployment_file',
        projectId,
        deploymentId,
        filename,
        resourcePath: raw,
      }
    }
    return { ...empty, level: 'invalid', resourcePath: raw }
  }

  return { ...empty, level: 'invalid', resourcePath: raw }
}
