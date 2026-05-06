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

import { normMountPrefix, type Workspace as CoreWorkspace } from '@struktoai/mirage-core'
import { buildResource, Workspace, type Resource } from '@struktoai/mirage-node'

export interface OverrideMountBlock {
  resource: string
  config?: Record<string, unknown>
}

export interface OverrideShape {
  mounts?: Record<string, OverrideMountBlock>
}

export async function buildOverrideResources(
  override: OverrideShape | null,
): Promise<Record<string, Resource>> {
  const mounts = override?.mounts
  if (mounts === undefined) return {}
  const out: Record<string, Resource> = {}
  for (const [prefix, block] of Object.entries(mounts)) {
    out[normMountPrefix(prefix)] = await buildResource(block.resource, block.config ?? {})
  }
  return out
}

function existingNeedsOverrideResources(
  src: CoreWorkspace,
  skip: Set<string>,
): Record<string, Resource> {
  const out: Record<string, Resource> = {}
  for (const m of src.mounts()) {
    if (skip.has(m.prefix)) continue
    const resource = m.resource as unknown as {
      getState?: () => { needsOverride?: boolean }
    }
    if (resource.getState === undefined) continue
    const state = resource.getState()
    if (state.needsOverride === true) out[m.prefix] = m.resource
  }
  return out
}

export async function cloneWorkspaceWithOverride(
  src: CoreWorkspace,
  override: OverrideShape | null,
): Promise<Workspace> {
  const overrideResources = await buildOverrideResources(override)
  const existing = existingNeedsOverrideResources(src, new Set(Object.keys(overrideResources)))
  const merged = { ...existing, ...overrideResources }
  const state = await src.toStateDict()
  return Workspace.fromState(state, {}, merged)
}
