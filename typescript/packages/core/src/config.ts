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

import { ConsistencyPolicy, MountMode } from './types.ts'

const VAR_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/g

export interface RamCacheBlock {
  type: 'ram'
  limit?: string | number
  maxDrainBytes?: number | null
}

export interface RedisCacheBlock {
  type: 'redis'
  limit?: string | number
  maxDrainBytes?: number | null
  url?: string
  keyPrefix?: string
}

export type CacheBlock = RamCacheBlock | RedisCacheBlock

export interface MountBlock {
  resource: string
  mode?: MountMode
  config?: Record<string, unknown>
}

export interface WorkspaceConfig {
  mounts: Record<string, MountBlock>
  mode?: MountMode
  consistency?: ConsistencyPolicy
  defaultSessionId?: string
  defaultAgentId?: string
  fuse?: boolean
  native?: boolean
  history?: number | null
  historyPath?: string | null
  cache?: CacheBlock | null
}

function interpolate(value: unknown, env: Record<string, string>, missing: string[]): unknown {
  if (typeof value === 'string') {
    return value.replace(VAR_RE, (_match, name: string) => {
      if (!(name in env)) {
        missing.push(name)
        return ''
      }
      return env[name] ?? ''
    })
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, env, missing))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = interpolate(v, env, missing)
    return out
  }
  return value
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(override)) {
    const existing = result[k]
    if (
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v)
    ) {
      result[k] = deepMerge(existing as Record<string, unknown>, v as Record<string, unknown>)
    } else {
      result[k] = v
    }
  }
  return result
}

export function loadConfigFromObject(
  raw: Record<string, unknown>,
  env?: Record<string, string>,
): WorkspaceConfig {
  const useEnv = env ?? loadEnv()
  const missing: string[] = []
  const interpolated = interpolate(raw, useEnv, missing) as Record<string, unknown>
  if (missing.length > 0) {
    const unique = [...new Set(missing)].sort()
    throw new Error(`missing environment variables: ${unique.join(', ')}`)
  }
  return validateConfig(interpolated)
}

export function mergeOverride(
  base: WorkspaceConfig,
  override: Record<string, unknown>,
  env?: Record<string, string>,
): WorkspaceConfig {
  const useEnv = env ?? loadEnv()
  const missing: string[] = []
  const interpolated = interpolate(override, useEnv, missing) as Record<string, unknown>
  if (missing.length > 0) {
    const unique = [...new Set(missing)].sort()
    throw new Error(`missing environment variables: ${unique.join(', ')}`)
  }
  const merged = deepMerge(base as unknown as Record<string, unknown>, interpolated)
  return validateConfig(merged)
}

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  if (typeof process !== 'undefined') {
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v
    }
  }
  return env
}

function validateConfig(raw: Record<string, unknown>): WorkspaceConfig {
  const mounts = raw.mounts
  if (typeof mounts !== 'object' || mounts === null || Array.isArray(mounts)) {
    throw new Error('config: mounts must be an object')
  }
  const out: WorkspaceConfig = {
    mounts: mounts as Record<string, MountBlock>,
    mode: (raw.mode as MountMode | undefined) ?? MountMode.WRITE,
    consistency: (raw.consistency as ConsistencyPolicy | undefined) ?? ConsistencyPolicy.LAZY,
    defaultSessionId: (raw.defaultSessionId as string | undefined) ?? 'default',
    defaultAgentId: (raw.defaultAgentId as string | undefined) ?? 'default',
    fuse: (raw.fuse as boolean | undefined) ?? false,
    native: (raw.native as boolean | undefined) ?? false,
    history: (raw.history as number | null | undefined) ?? 100,
    historyPath: (raw.historyPath as string | null | undefined) ?? null,
    cache: (raw.cache as CacheBlock | null | undefined) ?? null,
  }
  return out
}
