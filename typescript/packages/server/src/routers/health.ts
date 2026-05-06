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

import type { FastifyInstance } from 'fastify'
import type { WorkspaceRegistry } from '../registry.ts'

export interface HealthDeps {
  registry: WorkspaceRegistry
  startedAt: number
  exit: () => void
}

export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get('/v1/health', () => ({
    status: 'ok',
    workspaces: deps.registry.size(),
    uptimeS: Math.round((Date.now() / 1000 - deps.startedAt) * 1000) / 1000,
  }))
  app.post('/v1/shutdown', () => {
    deps.exit()
    return { status: 'shutting_down', pid: process.pid }
  })
}
