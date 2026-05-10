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

import { AsyncLocalStorage } from 'node:async_hooks'

import type { Session } from '../workspace/session/session.ts'

const sessionStorage = new AsyncLocalStorage<Session>()

export function runWithSession<T>(session: Session, fn: () => T): T {
  return sessionStorage.run(session, fn)
}

export function getCurrentSession(): Session | null {
  return sessionStorage.getStore() ?? null
}

export class MountNotAllowedError extends Error {
  readonly sessionId: string
  readonly mountPrefix: string
  constructor(sessionId: string, mountPrefix: string) {
    super(`session '${sessionId}' not allowed to access mount '${mountPrefix}'`)
    this.name = 'MountNotAllowedError'
    this.sessionId = sessionId
    this.mountPrefix = mountPrefix
  }
}

export function assertMountAllowed(mountPrefix: string): void {
  const sess = getCurrentSession()
  if (sess?.allowedMounts == null) return
  const stripped = mountPrefix.replace(/^\/+|\/+$/g, '')
  const norm = stripped === '' ? '/' : '/' + stripped
  if (norm === '/' || sess.allowedMounts.has(norm)) return
  throw new MountNotAllowedError(sess.sessionId, norm)
}
