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

import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { WorkspaceRegistry } from '../registry.ts'

export interface SessionsRoutesDeps {
  registry: WorkspaceRegistry
}

interface WsIdParams {
  wsId: string
}

interface WsSessionParams {
  wsId: string
  sessionId: string
}

interface CreateSessionBody {
  sessionId?: string
  /**
   * Optional list of mount prefixes this session is permitted to access.
   * When omitted (or null), the session can reach every mount on the
   * workspace. When provided, dispatch / commands / WorkspaceFS reject
   * paths that resolve to mounts outside this set with a capability
   * error. Infrastructure mounts (cache root, observer, /dev) are always
   * implicitly allowed.
   */
  allowedMounts?: string[] | null
}

export function registerSessionsRoutes(app: FastifyInstance, deps: SessionsRoutesDeps): void {
  app.post<{ Params: WsIdParams; Body: CreateSessionBody }>(
    '/v1/workspaces/:wsId/sessions',
    async (req, reply) => {
      const { wsId } = req.params
      if (!deps.registry.has(wsId)) {
        return reply.status(404).send({ detail: 'workspace not found' })
      }
      const sid = req.body.sessionId ?? `sess_${randomBytes(6).toString('hex')}`
      const ws = deps.registry.get(wsId).runner.ws
      if (ws.listSessions().some((s) => s.sessionId === sid)) {
        return reply.status(409).send({ detail: `session id already exists: ${sid}` })
      }
      const allowed =
        Array.isArray(req.body.allowedMounts) && req.body.allowedMounts.length > 0
          ? new Set(req.body.allowedMounts)
          : null
      const sess = ws.createSession(sid, allowed !== null ? { allowedMounts: allowed } : {})
      return reply.status(201).send({ sessionId: sess.sessionId, cwd: sess.cwd })
    },
  )

  app.get<{ Params: WsIdParams }>('/v1/workspaces/:wsId/sessions', (req, reply) => {
    const { wsId } = req.params
    if (!deps.registry.has(wsId)) {
      return reply.status(404).send({ detail: 'workspace not found' })
    }
    return deps.registry
      .get(wsId)
      .runner.ws.listSessions()
      .map((s) => ({ sessionId: s.sessionId, cwd: s.cwd }))
  })

  app.delete<{ Params: WsSessionParams }>(
    '/v1/workspaces/:wsId/sessions/:sessionId',
    async (req, reply) => {
      const { wsId, sessionId } = req.params
      if (!deps.registry.has(wsId)) {
        return reply.status(404).send({ detail: 'workspace not found' })
      }
      const ws = deps.registry.get(wsId).runner.ws
      if (!ws.listSessions().some((s) => s.sessionId === sessionId)) {
        return reply.status(404).send({ detail: 'session not found' })
      }
      await ws.closeSession(sessionId)
      return { sessionId }
    },
  )
}
