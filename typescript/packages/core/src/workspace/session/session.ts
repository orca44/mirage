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

import type { AsyncLineIterator } from '../../io/async_line_iterator.ts'

export interface SessionInit {
  sessionId: string
  cwd?: string
  env?: Record<string, string>
  createdAt?: number
  functions?: Record<string, unknown>
  lastExitCode?: number
  positionalArgs?: string[]
}

export class Session {
  readonly sessionId: string
  cwd: string
  env: Record<string, string>
  readonly createdAt: number
  functions: Record<string, unknown>
  lastExitCode: number
  positionalArgs: string[]
  stdinBuffer: AsyncLineIterator | null = null
  localVars: Map<string, string | null> | null = null

  constructor(init: SessionInit) {
    this.sessionId = init.sessionId
    this.cwd = init.cwd ?? '/'
    this.env = init.env ?? {}
    this.createdAt = init.createdAt ?? Date.now() / 1000
    this.functions = init.functions ?? {}
    this.lastExitCode = init.lastExitCode ?? 0
    this.positionalArgs = init.positionalArgs ?? []
  }

  toJSON(): Record<string, unknown> {
    return {
      sessionId: this.sessionId,
      cwd: this.cwd,
      env: this.env,
      createdAt: this.createdAt,
    }
  }

  static fromJSON(data: {
    sessionId: string
    cwd?: string
    env?: Record<string, string>
    createdAt?: number
  }): Session {
    return new Session(data)
  }
}
