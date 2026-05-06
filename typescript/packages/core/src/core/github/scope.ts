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

import { fnmatch } from '../s3/_client.ts'
import type { TreeEntry } from './entry.ts'

export function shouldUseSearch(
  isRegex: boolean,
  recursive: boolean,
  onDefaultBranch: boolean,
): boolean {
  return !isRegex && recursive && onDefaultBranch
}

export function estimateScope(
  tree: Record<string, TreeEntry>,
  directory: string,
  pattern: string,
): { fileCount: number; totalBytes: number } {
  const key = directory
  const prefix = key !== '' ? `${key}/` : ''
  let fileCount = 0
  let totalBytes = 0
  for (const [p, entry] of Object.entries(tree)) {
    if (!p.startsWith(prefix)) continue
    const remainder = p.slice(prefix.length)
    if (entry.type === 'blob' && fnmatch(remainder, pattern)) {
      fileCount += 1
      totalBytes += entry.size ?? 0
    }
  }
  return { fileCount, totalBytes }
}
