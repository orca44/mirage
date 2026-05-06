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

import type { RAMResource } from '../resource/ram/ram.ts'
import type { Resource } from '../resource/base.ts'
import { utcDateFolder } from '../utils/dates.ts'
import type { ExecutionRecord } from '../workspace/types.ts'
import { LogEntry } from './log_entry.ts'
import type { OpRecord } from './record.ts'

export class Observer {
  readonly resource: Resource
  readonly prefix: string
  private readonly sessionIds = new Set<string>()

  constructor(resource: Resource, prefix = '/.sessions') {
    this.resource = resource
    this.prefix = prefix
  }

  get sessions(): ReadonlySet<string> {
    return this.sessionIds
  }

  isObserverPath(path: string): boolean {
    const norm = this.prefix.replace(/\/+$/, '')
    return path === norm || path.startsWith(norm + '/')
  }

  async logOp(rec: OpRecord, agent: string, session: string, cwd?: string): Promise<void> {
    if (this.isObserverPath(rec.path)) return
    const entry = LogEntry.fromOpRecord(rec, agent, session, cwd)
    this.sessionIds.add(session)
    await this.append(`/${utcDateFolder()}/${session}.jsonl`, entry.toJsonLine() + '\n')
  }

  async logCommand(rec: ExecutionRecord, cwd?: string): Promise<void> {
    const entry = LogEntry.fromExecutionRecord(rec, cwd)
    this.sessionIds.add(rec.sessionId)
    await this.append(`/${utcDateFolder()}/${rec.sessionId}.jsonl`, entry.toJsonLine() + '\n')
  }

  private append(path: string, data: string): Promise<void> {
    const store = (this.resource as RAMResource).store
    const key = path.startsWith('/') ? path : '/' + path
    const lastSlash = key.lastIndexOf('/')
    const parent = lastSlash <= 0 ? '/' : key.slice(0, lastSlash)
    store.dirs.add(parent)
    const bytes = new TextEncoder().encode(data)
    const existing = store.files.get(key)
    if (existing === undefined) {
      store.files.set(key, bytes)
    } else {
      const merged = new Uint8Array(existing.length + bytes.length)
      merged.set(existing, 0)
      merged.set(bytes, existing.length)
      store.files.set(key, merged)
    }
    return Promise.resolve()
  }
}
