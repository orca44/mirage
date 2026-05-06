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

import type { PostHogAccessor } from '../../accessor/posthog.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { PathSpec } from '../../types.ts'
import {
  getProject,
  getUser,
  listCohorts,
  listDashboards,
  listFeatureFlags,
  listInsights,
  listPersons,
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

export async function read(
  accessor: PostHogAccessor,
  path: PathSpec | string,
  _index?: IndexCacheStore,
): Promise<Uint8Array> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const scope = detectScope(spec)

  if (scope.level === 'user_file') return jsonBytes(await getUser(accessor))

  if (scope.level === 'project_file' && scope.projectId !== null) {
    if (scope.filename === 'info.json')
      return jsonBytes(await getProject(accessor, scope.projectId))
    if (scope.filename === 'feature_flags.json')
      return jsonBytes((await listFeatureFlags(accessor, scope.projectId)).results)
    if (scope.filename === 'cohorts.json')
      return jsonBytes((await listCohorts(accessor, scope.projectId)).results)
    if (scope.filename === 'dashboards.json')
      return jsonBytes((await listDashboards(accessor, scope.projectId)).results)
    if (scope.filename === 'insights.json')
      return jsonBytes((await listInsights(accessor, scope.projectId)).results)
    if (scope.filename === 'persons.json')
      return jsonBytes((await listPersons(accessor, scope.projectId)).results)
  }

  throw notFound(spec.original)
}
