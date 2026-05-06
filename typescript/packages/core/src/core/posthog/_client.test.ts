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
import { PostHogAccessor } from '../../accessor/posthog.ts'
import { resolvePostHogConfig } from '../../resource/posthog/config.ts'
import type { PostHogDriver, PostHogPaged, PostHogProject, PostHogUser } from './_driver.ts'
import { read } from './read.ts'
import { readdir } from './readdir.ts'

class FakeDriver implements PostHogDriver {
  getUser(): Promise<PostHogUser> {
    return Promise.resolve({ email: 'me@example.com', distinct_id: 'u1' })
  }
  listProjects(): Promise<PostHogProject[]> {
    return Promise.resolve([
      { id: 1, name: 'Web' },
      { id: 2, name: 'Mobile' },
    ])
  }
  getProject(id: number | string): Promise<PostHogProject> {
    return Promise.resolve({ id: Number(id), name: 'Web', api_token: 'phc_xyz' })
  }
  listFeatureFlags(): Promise<PostHogPaged<unknown>> {
    return Promise.resolve({ count: 2, results: [{ key: 'beta' }, { key: 'dark-mode' }] })
  }
  listCohorts(): Promise<PostHogPaged<unknown>> {
    return Promise.resolve({ count: 1, results: [{ name: 'paid users' }] })
  }
  listDashboards(): Promise<PostHogPaged<unknown>> {
    return Promise.resolve({ count: 0, results: [] })
  }
  listInsights(): Promise<PostHogPaged<unknown>> {
    return Promise.resolve({ count: 0, results: [] })
  }
  listPersons(): Promise<PostHogPaged<unknown>> {
    return Promise.resolve({ count: 0, results: [] })
  }
  close(): Promise<void> {
    return Promise.resolve()
  }
}

const DEC = new TextDecoder()

function makeAccessor(): PostHogAccessor {
  return new PostHogAccessor(new FakeDriver(), resolvePostHogConfig({ apiKey: 'phx_x' }))
}

describe('posthog core', () => {
  it('readdir / lists root entries', async () => {
    const entries = await readdir(makeAccessor(), '/')
    expect(entries).toEqual(['/user.json', '/projects'])
  })

  it('readdir /projects calls listProjects', async () => {
    const entries = await readdir(makeAccessor(), '/projects')
    expect(entries).toEqual(['/projects/1', '/projects/2'])
  })

  it('readdir /projects/1 returns static files', async () => {
    const entries = await readdir(makeAccessor(), '/projects/1')
    expect(entries).toContain('/projects/1/info.json')
    expect(entries).toContain('/projects/1/feature_flags.json')
    expect(entries.length).toBe(6)
  })

  it('read /user.json returns user', async () => {
    const data = await read(makeAccessor(), '/user.json')
    const json = JSON.parse(DEC.decode(data)) as Record<string, unknown> &
      Record<number, Record<string, unknown>>
    expect(json.email).toBe('me@example.com')
  })

  it('read /projects/1/info.json returns project metadata', async () => {
    const data = await read(makeAccessor(), '/projects/1/info.json')
    const json = JSON.parse(DEC.decode(data)) as Record<string, unknown> &
      Record<number, Record<string, unknown>>
    expect(json.id).toBe(1)
  })

  it('read /projects/1/feature_flags.json unwraps results', async () => {
    const data = await read(makeAccessor(), '/projects/1/feature_flags.json')
    const json = JSON.parse(DEC.decode(data)) as Record<string, unknown>[]
    expect(Array.isArray(json)).toBe(true)
    expect(json.length).toBe(2)
    expect(json[0]?.key).toBe('beta')
  })

  it('read on invalid path throws ENOENT', async () => {
    await expect(read(makeAccessor(), '/projects/1/random.json')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
