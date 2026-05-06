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

import type { PathSpec } from '@struktoai/mirage-core'
import type { RedisAccessor } from '../../accessor/redis.ts'
import { norm } from './utils.ts'

export interface FindOptions {
  name?: string | null
  type?: 'f' | 'd' | null
  minSize?: number | null
  maxSize?: number | null
  maxDepth?: number | null
  minDepth?: number | null
  nameExclude?: string | null
  orNames?: string[] | null
  iname?: string | null
  pathPattern?: string | null
}

function fnmatch(name: string, pattern: string): boolean {
  let re = '^'
  for (const ch of pattern) {
    if (ch === '*') re += '.*'
    else if (ch === '?') re += '.'
    else if (/[.+^${}()|[\]\\]/.test(ch)) re += '\\' + ch
    else re += ch
  }
  re += '$'
  return new RegExp(re).test(name)
}

export async function find(
  accessor: RedisAccessor,
  path: PathSpec,
  options: FindOptions = {},
): Promise<string[]> {
  const p = norm(path.stripPrefix)
  const store = accessor.store
  const prefix = p.replace(/\/+$/, '') + '/'
  const baseDepth = (p.match(/\//g) ?? []).length
  const results: string[] = []
  const candidates: [string, 'f' | 'd'][] = []
  if (options.type !== 'd') {
    for (const key of await store.listFiles()) candidates.push([key, 'f'])
  }
  if (options.type !== 'f') {
    for (const key of await store.listDirs()) {
      if (key !== '/') candidates.push([key, 'd'])
    }
  }
  for (const [key, kind] of candidates) {
    if (key !== p && !key.startsWith(prefix)) continue
    if (key === p && kind === 'd') continue
    const depth = (key.match(/\//g) ?? []).length - baseDepth
    if (options.maxDepth !== null && options.maxDepth !== undefined && depth > options.maxDepth)
      continue
    if (options.minDepth !== null && options.minDepth !== undefined && depth < options.minDepth)
      continue
    const basename = key.slice(key.lastIndexOf('/') + 1)
    if (options.name !== null && options.name !== undefined && !fnmatch(basename, options.name))
      continue
    if (
      options.iname !== null &&
      options.iname !== undefined &&
      !fnmatch(basename.toLowerCase(), options.iname.toLowerCase())
    )
      continue
    if (
      options.pathPattern !== null &&
      options.pathPattern !== undefined &&
      !fnmatch(key, options.pathPattern)
    )
      continue
    if (
      options.orNames !== null &&
      options.orNames !== undefined &&
      !options.orNames.some((pat) => fnmatch(basename, pat))
    )
      continue
    if (
      options.nameExclude !== null &&
      options.nameExclude !== undefined &&
      fnmatch(basename, options.nameExclude)
    )
      continue
    if (
      kind === 'f' &&
      ((options.minSize !== null && options.minSize !== undefined) ||
        (options.maxSize !== null && options.maxSize !== undefined))
    ) {
      const size = await store.fileLen(key)
      if (options.minSize !== null && options.minSize !== undefined && size < options.minSize)
        continue
      if (options.maxSize !== null && options.maxSize !== undefined && size > options.maxSize)
        continue
    }
    results.push(key)
  }
  results.sort()
  return results
}
