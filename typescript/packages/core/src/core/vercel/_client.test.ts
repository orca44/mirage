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

import { describe, expect, it } from 'vitest'
import { VercelAccessor } from '../../accessor/vercel.ts'
import { resolveVercelConfig } from '../../resource/vercel/config.ts'
import type {
  VercelDeployment,
  VercelDeploymentEvent,
  VercelDomain,
  VercelDriver,
  VercelEnvVar,
  VercelProject,
  VercelTeam,
  VercelTeamMember,
  VercelUser,
} from './_driver.ts'
import { read } from './read.ts'
import { readdir } from './readdir.ts'

class FakeDriver implements VercelDriver {
  getUser(): Promise<VercelUser> {
    return Promise.resolve({ id: 'u1', username: 'alice', email: 'a@x.com' })
  }
  listTeams(): Promise<{ teams: VercelTeam[] }> {
    return Promise.resolve({ teams: [{ id: 'team_a', slug: 'a', name: 'Team A' }] })
  }
  getTeam(teamId: string): Promise<VercelTeam> {
    return Promise.resolve({ id: teamId, slug: 'a', name: 'Team A' })
  }
  listTeamMembers(): Promise<{ members: VercelTeamMember[] }> {
    return Promise.resolve({ members: [{ uid: 'u1', username: 'alice', role: 'OWNER' }] })
  }
  listProjects(): Promise<{ projects: VercelProject[] }> {
    return Promise.resolve({
      projects: [
        { id: 'prj_1', name: 'web' },
        { id: 'prj_2', name: 'api' },
      ],
    })
  }
  getProject(id: string): Promise<VercelProject> {
    return Promise.resolve({ id, name: 'web', framework: 'nextjs' })
  }
  listProjectDomains(): Promise<{ domains: VercelDomain[] }> {
    return Promise.resolve({ domains: [{ name: 'web.example.com', verified: true }] })
  }
  listProjectEnv(): Promise<{ envs: VercelEnvVar[] }> {
    return Promise.resolve({
      envs: [{ id: 'e1', key: 'DATABASE_URL', value: 'postgres://supersecret', type: 'encrypted' }],
    })
  }
  listProjectDeployments(): Promise<{ deployments: VercelDeployment[] }> {
    return Promise.resolve({
      deployments: [
        { uid: 'dpl_1', name: 'web', state: 'READY' },
        { uid: 'dpl_2', name: 'web', state: 'BUILDING' },
      ],
    })
  }
  getDeployment(uid: string): Promise<VercelDeployment> {
    return Promise.resolve({ uid, name: 'web', state: 'READY' })
  }
  listDeploymentEvents(): Promise<VercelDeploymentEvent[]> {
    return Promise.resolve([{ type: 'stdout', payload: { text: 'building' } }])
  }
  close(): Promise<void> {
    return Promise.resolve()
  }
}

const DEC = new TextDecoder()

function makeAccessor(): VercelAccessor {
  return new VercelAccessor(new FakeDriver(), resolveVercelConfig({ token: 'x' }))
}

describe('vercel core', () => {
  it('readdir / lists root entries', async () => {
    const entries = await readdir(makeAccessor(), '/')
    expect(entries).toEqual(['/user.json', '/teams', '/projects'])
  })

  it('readdir /teams calls listTeams', async () => {
    const entries = await readdir(makeAccessor(), '/teams')
    expect(entries).toEqual(['/teams/team_a'])
  })

  it('readdir /projects calls listProjects', async () => {
    const entries = await readdir(makeAccessor(), '/projects')
    expect(entries).toEqual(['/projects/prj_1', '/projects/prj_2'])
  })

  it('readdir /projects/<id> returns static entries', async () => {
    const entries = await readdir(makeAccessor(), '/projects/prj_1')
    expect(entries.sort()).toEqual([
      '/projects/prj_1/deployments',
      '/projects/prj_1/domains.json',
      '/projects/prj_1/env.json',
      '/projects/prj_1/info.json',
    ])
  })

  it('readdir /projects/<id>/deployments calls listProjectDeployments', async () => {
    const entries = await readdir(makeAccessor(), '/projects/prj_1/deployments')
    expect(entries).toEqual([
      '/projects/prj_1/deployments/dpl_1',
      '/projects/prj_1/deployments/dpl_2',
    ])
  })

  it('read /user.json returns the user', async () => {
    const data = await read(makeAccessor(), '/user.json')
    const json = JSON.parse(DEC.decode(data)) as Record<string, unknown> &
      Record<number, Record<string, unknown>>
    expect(json.username).toBe('alice')
  })

  it('read /projects/<id>/info.json returns project metadata', async () => {
    const data = await read(makeAccessor(), '/projects/prj_1/info.json')
    const json = JSON.parse(DEC.decode(data)) as Record<string, unknown> &
      Record<number, Record<string, unknown>>
    expect(json.framework).toBe('nextjs')
  })

  it('read /projects/<id>/env.json redacts values', async () => {
    const data = await read(makeAccessor(), '/projects/prj_1/env.json')
    const json = JSON.parse(DEC.decode(data)) as Record<string, unknown>[]
    expect(json[0]?.value).toBe('<REDACTED>')
    expect(json[0]?.key).toBe('DATABASE_URL')
  })

  it('read /projects/<id>/deployments/<uid>/info.json returns deployment', async () => {
    const data = await read(makeAccessor(), '/projects/prj_1/deployments/dpl_1/info.json')
    const json = JSON.parse(DEC.decode(data)) as Record<string, unknown> &
      Record<number, Record<string, unknown>>
    expect(json.uid).toBe('dpl_1')
  })

  it('read on invalid path throws ENOENT', async () => {
    await expect(read(makeAccessor(), '/projects/p/random.json')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
