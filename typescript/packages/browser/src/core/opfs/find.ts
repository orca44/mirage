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
import { isNotFound, iterEntries, norm, resolveDirHandle } from './utils.ts'

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
  mtimeMin?: number | null
  mtimeMax?: number | null
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

interface WalkCtx {
  options: FindOptions
  results: string[]
}

async function walk(
  ctx: WalkCtx,
  dir: FileSystemDirectoryHandle,
  current: string,
  depth: number,
): Promise<void> {
  const opts = ctx.options
  if (opts.maxDepth !== null && opts.maxDepth !== undefined && depth > opts.maxDepth) return
  let iter: AsyncIterable<[string, FileSystemHandle]>
  try {
    iter = iterEntries(dir)
  } catch {
    return
  }
  for await (const [entryName, handle] of iter) {
    const kind: 'f' | 'd' = handle.kind === 'directory' ? 'd' : 'f'
    const entryPath = current === '/' ? `/${entryName}` : `${current}/${entryName}`
    if (opts.type === 'f' && kind !== 'f') {
      if (handle.kind === 'directory') {
        try {
          const child = await dir.getDirectoryHandle(entryName, { create: false })
          await walk(ctx, child, entryPath, depth + 1)
        } catch {
          // ignore
        }
      }
      continue
    }
    if (opts.type === 'd' && kind !== 'd') continue
    const entryDepth = depth + 1

    let accept = true
    if (opts.orNames !== null && opts.orNames !== undefined && opts.orNames.length > 0) {
      if (!opts.orNames.some((pat) => fnmatch(entryName, pat))) accept = false
    } else if (opts.name !== null && opts.name !== undefined) {
      if (!fnmatch(entryName, opts.name)) accept = false
    }
    if (
      accept &&
      opts.iname !== null &&
      opts.iname !== undefined &&
      !fnmatch(entryName.toLowerCase(), opts.iname.toLowerCase())
    ) {
      accept = false
    }
    if (
      accept &&
      opts.pathPattern !== null &&
      opts.pathPattern !== undefined &&
      !fnmatch(entryPath, opts.pathPattern)
    ) {
      accept = false
    }
    if (
      accept &&
      opts.nameExclude !== null &&
      opts.nameExclude !== undefined &&
      fnmatch(entryName, opts.nameExclude)
    ) {
      accept = false
    }
    if (
      accept &&
      opts.maxDepth !== null &&
      opts.maxDepth !== undefined &&
      entryDepth > opts.maxDepth
    ) {
      accept = false
    }
    if (
      accept &&
      opts.minDepth !== null &&
      opts.minDepth !== undefined &&
      entryDepth < opts.minDepth
    ) {
      accept = false
    }

    if (
      accept &&
      kind === 'f' &&
      (opts.minSize !== null ||
        opts.maxSize !== null ||
        opts.mtimeMin !== null ||
        opts.mtimeMax !== null)
    ) {
      try {
        const fh = await dir.getFileHandle(entryName, { create: false })
        const file = await fh.getFile()
        if (opts.minSize !== null && opts.minSize !== undefined && file.size < opts.minSize)
          accept = false
        if (opts.maxSize !== null && opts.maxSize !== undefined && file.size > opts.maxSize)
          accept = false
        if (accept && (opts.mtimeMin !== undefined || opts.mtimeMax !== undefined)) {
          const mtime = file.lastModified / 1000
          if (opts.mtimeMin !== null && opts.mtimeMin !== undefined && mtime < opts.mtimeMin)
            accept = false
          if (opts.mtimeMax !== null && opts.mtimeMax !== undefined && mtime > opts.mtimeMax)
            accept = false
        }
      } catch {
        accept = false
      }
    }

    if (accept) ctx.results.push(entryPath)

    if (kind === 'd') {
      try {
        const child = await dir.getDirectoryHandle(entryName, { create: false })
        await walk(ctx, child, entryPath, depth + 1)
      } catch {
        // ignore
      }
    }
  }
}

export async function find(
  root: FileSystemDirectoryHandle,
  p: PathSpec,
  options: FindOptions = {},
): Promise<string[]> {
  const virtual = norm(p.stripPrefix)
  const results: string[] = []
  let dir: FileSystemDirectoryHandle
  try {
    dir = await resolveDirHandle(root, virtual, { create: false })
  } catch (err) {
    if (isNotFound(err)) return results
    throw err
  }
  await walk({ options, results }, dir, virtual, 0)
  results.sort()
  return results
}
