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

import path from 'node:path'

export function resolveSafe(root: string, virtual: string): string {
  const relative = virtual.replace(/^\/+/, '')
  const resolved = path.resolve(root, relative)
  const rootResolved = path.resolve(root)
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error(`path escapes root: ${virtual}`)
  }
  return resolved
}

export function norm(p: string): string {
  return `/${p.replace(/^\/+|\/+$/g, '')}`
}

export function parent(p: string): string {
  const i = p.lastIndexOf('/')
  if (i <= 0) return '/'
  return p.slice(0, i)
}

export function basename(p: string): string {
  const tail = p.split('/').pop()
  return tail !== undefined && tail.length > 0 ? tail : '/'
}
