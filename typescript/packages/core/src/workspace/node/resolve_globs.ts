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

import type { Resource } from '../../resource/base.ts'
import { PathSpec } from '../../types.ts'
import type { MountRegistry } from '../mount/registry.ts'

export interface ResourceWithGlob extends Resource {
  glob(paths: readonly PathSpec[], prefix?: string): Promise<PathSpec[]>
}

function hasGlob(r: Resource): r is ResourceWithGlob {
  return 'glob' in r && typeof (r as { glob?: unknown }).glob === 'function'
}

export async function resolveGlobs(
  classified: readonly (string | PathSpec)[],
  registry: MountRegistry,
  textArgs: ReadonlySet<string> | null = null,
): Promise<(string | PathSpec)[]> {
  const result: (string | PathSpec)[] = []
  for (const item of classified) {
    if (item instanceof PathSpec && item.pattern !== null) {
      if (textArgs?.has(item.original) === true) {
        result.push(item.original)
        continue
      }
      const mount = registry.mountFor(item.original)
      if (mount === null || !hasGlob(mount.resource)) {
        result.push(item)
        continue
      }
      const prefix = mount.prefix.replace(/\/+$/, '')
      const withPrefix = new PathSpec({
        original: item.original,
        directory: item.directory,
        pattern: item.pattern,
        resolved: item.resolved,
        prefix,
      })
      try {
        const resolved = await mount.resource.glob([withPrefix], prefix)
        for (const p of resolved) result.push(p)
      } catch {
        result.push(withPrefix)
      }
    } else {
      result.push(item)
    }
  }
  return result
}
