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
import { FileStat, FileType, PathSpec } from '../../types.ts'
import { detectScope } from './scope.ts'

function notFound(p: string): Error {
  const err = new Error(p) as Error & { code?: string }
  err.code = 'ENOENT'
  return err
}

function statImpl(path: PathSpec | string): FileStat {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const scope = detectScope(spec)

  if (scope.level === 'invalid') throw notFound(spec.original)

  if (scope.level === 'root') {
    return new FileStat({ name: '/', type: FileType.DIRECTORY })
  }

  if (scope.level === 'user_file') {
    return new FileStat({ name: 'user.json', type: FileType.JSON })
  }

  if (
    scope.level === 'teams_dir' ||
    scope.level === 'projects_dir' ||
    scope.level === 'deployments_dir'
  ) {
    const name =
      scope.resourcePath
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .pop() ?? ''
    return new FileStat({ name, type: FileType.DIRECTORY })
  }

  if (scope.level === 'team_dir' && scope.teamId !== null) {
    return new FileStat({
      name: scope.teamId,
      type: FileType.DIRECTORY,
      extra: { teamId: scope.teamId },
    })
  }

  if (scope.level === 'project_dir' && scope.projectId !== null) {
    return new FileStat({
      name: scope.projectId,
      type: FileType.DIRECTORY,
      extra: { projectId: scope.projectId },
    })
  }

  if (scope.level === 'deployment_dir' && scope.deploymentId !== null) {
    return new FileStat({
      name: scope.deploymentId,
      type: FileType.DIRECTORY,
      extra: { deploymentId: scope.deploymentId, projectId: scope.projectId },
    })
  }

  if (
    (scope.level === 'team_file' ||
      scope.level === 'project_file' ||
      scope.level === 'deployment_file') &&
    scope.filename !== null
  ) {
    return new FileStat({
      name: scope.filename,
      type: FileType.JSON,
      extra: {
        teamId: scope.teamId,
        projectId: scope.projectId,
        deploymentId: scope.deploymentId,
      },
    })
  }

  throw notFound(spec.original)
}

export function stat(
  _accessor: VercelAccessor,
  path: PathSpec | string,
  _index?: IndexCacheStore,
): Promise<FileStat> {
  return Promise.resolve(statImpl(path))
}
