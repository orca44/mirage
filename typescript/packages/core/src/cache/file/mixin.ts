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

import type { PathSpec } from '../../types.ts'

export interface FileCache {
  get(key: string): Promise<Uint8Array | null>
  set(
    key: string,
    data: Uint8Array,
    options?: { fingerprint?: string | null; ttl?: number | null },
  ): Promise<void>
  add(
    key: string,
    data: Uint8Array,
    options?: { fingerprint?: string | null; ttl?: number | null },
  ): Promise<boolean>
  remove(key: string): Promise<void>
  exists(key: string | PathSpec): Promise<boolean>
  isFresh(key: string, remoteFingerprint: string): Promise<boolean>
  clear(): Promise<void>
  allCached(keys: readonly string[]): Promise<boolean>
  multiGet(keys: readonly string[]): Promise<(Uint8Array | null)[]>
  readonly cacheSize: number
  readonly cacheLimit: number
  maxDrainBytes: number | null
}
