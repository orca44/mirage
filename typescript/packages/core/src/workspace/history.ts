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

import type { ExecutionRecord } from './types.ts'

export interface ExecutionHistoryOptions {
  maxEntries?: number
  onPersist?: (record: ExecutionRecord) => void | Promise<void>
}

export class ExecutionHistory {
  private readonly buffer: ExecutionRecord[] = []
  private readonly maxEntries: number
  private readonly onPersist: ((record: ExecutionRecord) => void | Promise<void>) | null

  constructor(options: ExecutionHistoryOptions = {}) {
    this.maxEntries = options.maxEntries ?? 100
    this.onPersist = options.onPersist ?? null
  }

  async append(record: ExecutionRecord): Promise<void> {
    this.buffer.push(record)
    while (this.buffer.length > this.maxEntries) this.buffer.shift()
    if (this.onPersist !== null) await this.onPersist(record)
  }

  entries(): ExecutionRecord[] {
    return [...this.buffer]
  }

  clear(): void {
    this.buffer.length = 0
  }
}
