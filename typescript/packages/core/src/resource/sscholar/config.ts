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

export interface SSCholarConfig {
  apiKey?: string | null
  baseUrl?: string
  defaultListLimit?: number
  defaultSearchLimit?: number
  defaultSnippetLimit?: number
}

export interface SSCholarConfigResolved {
  apiKey: string | null
  baseUrl: string
  defaultListLimit: number
  defaultSearchLimit: number
  defaultSnippetLimit: number
}

export function normalizeSSCholarConfig(input: Record<string, unknown>): SSCholarConfig {
  return normalizeFields(input) as unknown as SSCholarConfig
}

export function resolveSSCholarConfig(config: SSCholarConfig = {}): SSCholarConfigResolved {
  return {
    apiKey: config.apiKey ?? null,
    baseUrl: config.baseUrl ?? 'https://api.semanticscholar.org',
    defaultListLimit: config.defaultListLimit ?? 100,
    defaultSearchLimit: config.defaultSearchLimit ?? 20,
    defaultSnippetLimit: config.defaultSnippetLimit ?? 10,
  }
}
