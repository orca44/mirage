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
import { IndexEntry } from '../../cache/index/config.ts'
import type { IndexCacheStore } from '../../cache/index/store.ts'
import { PathSpec } from '../../types.ts'
import { listProjects } from './_client.ts'
import { PROJECT_FILES, ROOT_ENTRIES, detectScope } from './scope.ts'

function notFound(p: string): Error {
  const err = new Error(p) as Error & { code?: string }
  err.code = 'ENOENT'
  return err
}

async function buildStaticDir(
  items: readonly string[],
  resourceType: string,
  prefix: string,
  key: string,
  index?: IndexCacheStore,
): Promise<string[]> {
  const virtualKey = key !== '' ? `${prefix}/${key}` : prefix !== '' ? prefix : '/'
  const entries: [string, IndexEntry][] = []
  const names: string[] = []
  for (const item of items) {
    entries.push([item, new IndexEntry({ id: item, name: item, resourceType, vfsName: item })])
    const full = key !== '' ? `${prefix}/${key}/${item}` : `${prefix}/${item}`
    names.push(full)
  }
  if (index !== undefined) await index.setDir(virtualKey, entries)
  return names
}

export async function readdir(
  accessor: PostHogAccessor,
  path: PathSpec | string,
  index?: IndexCacheStore,
): Promise<string[]> {
  const spec = typeof path === 'string' ? PathSpec.fromStrPath(path) : path
  const prefix = spec.prefix
  const scope = detectScope(spec)
  const key = scope.resourcePath.replace(/^\/+|\/+$/g, '')
  const virtualKey = key !== '' ? `${prefix}/${key}` : prefix !== '' ? prefix : '/'

  if (scope.level === 'invalid' || scope.level === 'user_file' || scope.level === 'project_file') {
    throw notFound(spec.original)
  }

  if (index !== undefined) {
    const cached = await index.listDir(virtualKey)
    if (cached.entries !== null && cached.entries !== undefined) return cached.entries
  }

  if (scope.level === 'root') {
    return buildStaticDir(ROOT_ENTRIES, 'posthog/root', prefix, '', index)
  }

  if (scope.level === 'projects_dir') {
    const projects = await listProjects(accessor)
    const entries: [string, IndexEntry][] = []
    const names: string[] = []
    for (const p of projects) {
      const id = String(p.id)
      entries.push([
        id,
        new IndexEntry({ id, name: p.name, resourceType: 'posthog/project', vfsName: id }),
      ])
      names.push(`${prefix}/${key}/${id}`)
    }
    if (index !== undefined) await index.setDir(virtualKey, entries)
    return names
  }

  return buildStaticDir(PROJECT_FILES, 'posthog/project-file', prefix, key, index)
}
