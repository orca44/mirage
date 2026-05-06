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

  if (scope.level === 'projects_dir') {
    return new FileStat({ name: 'projects', type: FileType.DIRECTORY })
  }

  if (scope.level === 'project_dir' && scope.projectId !== null) {
    return new FileStat({
      name: scope.projectId,
      type: FileType.DIRECTORY,
      extra: { projectId: scope.projectId },
    })
  }

  if (scope.level === 'project_file' && scope.filename !== null) {
    return new FileStat({
      name: scope.filename,
      type: FileType.JSON,
      extra: { projectId: scope.projectId },
    })
  }

  throw notFound(spec.original)
}

export function stat(
  _accessor: PostHogAccessor,
  path: PathSpec | string,
  _index?: IndexCacheStore,
): Promise<FileStat> {
  return Promise.resolve(statImpl(path))
}
