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
  shellOptions?: Record<string, boolean>
  readonlyVars?: Set<string>
  arrays?: Record<string, string[]>
  /**
   * Mount prefixes this session is allowed to touch. `null` (the default)
   * means no restriction — every mount in the workspace is reachable.
   * When provided, dispatch / handle_command / Ops all reject paths that
   * resolve to mounts outside this set with a capability error. The
   * workspace always implicitly grants access to its own infrastructure
   * mounts (cache root, observer, /dev) regardless of this allowlist.
   */
  allowedMounts?: ReadonlySet<string> | null
}

export class Session {
  readonly sessionId: string
  cwd: string
  env: Record<string, string>
  readonly createdAt: number
  functions: Record<string, unknown>
  lastExitCode: number
  positionalArgs: string[]
  shellOptions: Record<string, boolean>
  readonlyVars: Set<string>
  arrays: Record<string, string[]>
  stdinBuffer: AsyncLineIterator | null = null
  localVars: Map<string, string | null> | null = null
  readonly allowedMounts: ReadonlySet<string> | null

  constructor(init: SessionInit) {
    this.sessionId = init.sessionId
    this.cwd = init.cwd ?? '/'
    this.env = init.env ?? {}
    this.createdAt = init.createdAt ?? Date.now() / 1000
    this.functions = init.functions ?? {}
    this.lastExitCode = init.lastExitCode ?? 0
    this.positionalArgs = init.positionalArgs ?? []
    this.shellOptions = init.shellOptions ?? {}
    this.readonlyVars = init.readonlyVars ?? new Set()
    this.arrays = init.arrays ?? {}
    this.allowedMounts = init.allowedMounts ?? null
  }

  /**
   * Return a copy of this session with `overrides` applied. Mutable
   * containers (env, functions, readonlyVars, arrays, positionalArgs)
   * are shallow-copied so mutations on the fork do not leak back into
   * the source. Every field — including capability fields like
   * `allowedMounts` — is propagated, so callers cannot accidentally
   * forget one when adding new fields.
   */
  fork(overrides: Partial<SessionInit> = {}): Session {
    return new Session({
      sessionId: overrides.sessionId ?? this.sessionId,
      cwd: overrides.cwd ?? this.cwd,
      env: overrides.env ?? { ...this.env },
      createdAt: overrides.createdAt ?? this.createdAt,
      functions: overrides.functions ?? { ...this.functions },
      lastExitCode: overrides.lastExitCode ?? this.lastExitCode,
      positionalArgs: overrides.positionalArgs ?? [...this.positionalArgs],
      shellOptions: overrides.shellOptions ?? { ...this.shellOptions },
      readonlyVars: overrides.readonlyVars ?? new Set(this.readonlyVars),
      arrays:
        overrides.arrays ??
        Object.fromEntries(Object.entries(this.arrays).map(([k, v]) => [k, [...v]])),
      allowedMounts: overrides.allowedMounts ?? this.allowedMounts,
    })
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
