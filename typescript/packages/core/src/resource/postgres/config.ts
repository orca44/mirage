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

import { normalizeFields } from '../../utils/normalize.ts'

export interface PostgresConfig {
  dsn: string
  schemas?: readonly string[]
  defaultRowLimit?: number
  maxReadRows?: number
  maxReadBytes?: number
  defaultSearchLimit?: number
}

export interface PostgresConfigResolved {
  dsn: string
  schemas: readonly string[] | null
  defaultRowLimit: number
  maxReadRows: number
  maxReadBytes: number
  defaultSearchLimit: number
}

export function normalizePostgresConfig(input: Record<string, unknown>): PostgresConfig {
  return normalizeFields(input) as unknown as PostgresConfig
}

export function resolvePostgresConfig(config: PostgresConfig): PostgresConfigResolved {
  return {
    dsn: config.dsn,
    schemas: config.schemas ?? null,
    defaultRowLimit: config.defaultRowLimit ?? 1000,
    maxReadRows: config.maxReadRows ?? 10_000,
    maxReadBytes: config.maxReadBytes ?? 10 * 1024 * 1024,
    defaultSearchLimit: config.defaultSearchLimit ?? 100,
  }
}
