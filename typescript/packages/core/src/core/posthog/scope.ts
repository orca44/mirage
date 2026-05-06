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

export type PostHogLevel =
  | 'root'
  | 'user_file'
  | 'projects_dir'
  | 'project_dir'
  | 'project_file'
  | 'invalid'

export interface PostHogScope {
  level: PostHogLevel
  projectId: string | null
  filename: string | null
  resourcePath: string
}

export const ROOT_ENTRIES: readonly string[] = Object.freeze(['user.json', 'projects'])
export const PROJECT_FILES: readonly string[] = Object.freeze([
  'info.json',
  'feature_flags.json',
  'cohorts.json',
  'dashboards.json',
  'insights.json',
  'persons.json',
])

export function detectScope(path: PathSpec | string): PostHogScope {
  const raw = path instanceof PathSpec ? path.stripPrefix : path
  const key = raw.replace(/^\/+|\/+$/g, '')
  const empty: PostHogScope = {
    level: 'root',
    projectId: null,
    filename: null,
    resourcePath: '/',
  }
  if (key === '') return empty

  const parts = key.split('/')
  const head = parts[0] ?? ''

  if (head === 'user.json' && parts.length === 1) {
    return { ...empty, level: 'user_file', filename: 'user.json', resourcePath: raw }
  }

  if (head === 'projects') {
    if (parts.length === 1) return { ...empty, level: 'projects_dir', resourcePath: raw }
    const projectId = parts[1] ?? ''
    if (parts.length === 2) {
      return { ...empty, level: 'project_dir', projectId, resourcePath: raw }
    }
    if (parts.length === 3) {
      const filename = parts[2] ?? ''
      if (!PROJECT_FILES.includes(filename)) {
        return { ...empty, level: 'invalid', resourcePath: raw }
      }
      return { ...empty, level: 'project_file', projectId, filename, resourcePath: raw }
    }
    return { ...empty, level: 'invalid', resourcePath: raw }
  }

  return { ...empty, level: 'invalid', resourcePath: raw }
}
