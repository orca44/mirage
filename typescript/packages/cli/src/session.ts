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

import type { Command } from 'commander'
import { makeClient } from './client.ts'
import { emit, handleResponse } from './output.ts'
import { loadDaemonSettings } from './settings.ts'

function buildClient() {
  return makeClient(loadDaemonSettings())
}

export function registerSessionCommands(program: Command): void {
  const sess = program.command('session').description('Manage workspace sessions.')

  sess
    .command('create')
    .argument('<wsId>')
    .option('--id <sessionId>')
    .action(async (wsId: string, opts: { id?: string }) => {
      const c = buildClient()
      await c.ensureRunning({ allowSpawn: false })
      const body: Record<string, unknown> = {}
      if (opts.id !== undefined) body.sessionId = opts.id
      emit(
        await handleResponse(
          await c.request('POST', `/v1/workspaces/${wsId}/sessions`, {
            body: JSON.stringify(body),
          }),
        ),
      )
    })

  sess
    .command('list')
    .argument('<wsId>')
    .action(async (wsId: string) => {
      const c = buildClient()
      await c.ensureRunning({ allowSpawn: false })
      emit(await handleResponse(await c.request('GET', `/v1/workspaces/${wsId}/sessions`)))
    })

  sess
    .command('delete')
    .argument('<wsId>')
    .argument('<sessionId>')
    .action(async (wsId: string, sessionId: string) => {
      const c = buildClient()
      await c.ensureRunning({ allowSpawn: false })
      emit(
        await handleResponse(
          await c.request('DELETE', `/v1/workspaces/${wsId}/sessions/${sessionId}`),
        ),
      )
    })
}
