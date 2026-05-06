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

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../core/vercel/read.ts', () => ({ read: vi.fn() }))
vi.mock('../../../core/vercel/readdir.ts', () => ({ readdir: vi.fn() }))
vi.mock('../../../core/vercel/stat.ts', () => ({ stat: vi.fn() }))

import { VercelAccessor } from '../../../accessor/vercel.ts'
import type { VercelDriver } from '../../../core/vercel/_driver.ts'
import * as readModule from '../../../core/vercel/read.ts'
import * as readdirModule from '../../../core/vercel/readdir.ts'
import * as statModule from '../../../core/vercel/stat.ts'
import { resolveVercelConfig } from '../../../resource/vercel/config.ts'
import { type FileStat, FileType, PathSpec } from '../../../types.ts'
import { VERCEL_RG } from './rg.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder()

class StubDriver implements VercelDriver {
  getUser(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  listTeams(): Promise<{ teams: never[] }> {
    return Promise.resolve({ teams: [] })
  }
  getTeam(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  listTeamMembers(): Promise<{ members: never[] }> {
    return Promise.resolve({ members: [] })
  }
  listProjects(): Promise<{ projects: never[] }> {
    return Promise.resolve({ projects: [] })
  }
  getProject(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  listProjectDomains(): Promise<{ domains: never[] }> {
    return Promise.resolve({ domains: [] })
  }
  listProjectEnv(): Promise<{ envs: never[] }> {
    return Promise.resolve({ envs: [] })
  }
  listProjectDeployments(): Promise<{ deployments: never[] }> {
    return Promise.resolve({ deployments: [] })
  }
  getDeployment(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  listDeploymentEvents(): Promise<never[]> {
    return Promise.resolve([])
  }
  close(): Promise<void> {
    return Promise.resolve()
  }
}

function makeAccessor(): VercelAccessor {
  return new VercelAccessor(new StubDriver(), resolveVercelConfig({ token: 't' }))
}

async function runRg(
  paths: PathSpec[],
  texts: string[],
  flags: Record<string, string | boolean> = {},
): Promise<{ stdout: string; exitCode: number }> {
  const cmd = VERCEL_RG[0]
  if (cmd === undefined) throw new Error('rg not registered')
  const result = await cmd.fn(makeAccessor(), paths, texts, {
    stdin: null,
    flags,
    filetypeFns: null,
    cwd: '/',
    resource: { kind: 'vercel' } as never,
  })
  if (result === null) return { stdout: '', exitCode: 0 }
  const [out, io] = result
  const bytes = out instanceof Uint8Array ? out : new Uint8Array()
  return { stdout: DEC.decode(bytes), exitCode: io.exitCode }
}

function path(p: string): PathSpec {
  return new PathSpec({ original: p, directory: p, resolved: true, prefix: '' })
}

describe('vercel rg', () => {
  beforeEach(() => {
    vi.mocked(readModule.read).mockReset()
    vi.mocked(readdirModule.readdir).mockReset()
    vi.mocked(statModule.stat).mockReset()
  })

  it('matches a file', async () => {
    vi.mocked(statModule.stat).mockResolvedValue({
      name: 'env.json',
      type: FileType.JSON,
    } as FileStat)
    vi.mocked(readModule.read).mockResolvedValue(ENC.encode('NODE_ENV=production\nDEBUG=0\n'))
    const { stdout, exitCode } = await runRg([path('/proj_x/env.json')], ['NODE_ENV'])
    expect(stdout).toContain('NODE_ENV=production')
    expect(exitCode).toBe(0)
  })

  it('returns exit 1 when no match', async () => {
    vi.mocked(statModule.stat).mockResolvedValue({
      name: 'env.json',
      type: FileType.JSON,
    } as FileStat)
    vi.mocked(readModule.read).mockResolvedValue(ENC.encode('foo\nbar\n'))
    const { exitCode } = await runRg([path('/proj_x/env.json')], ['missing'])
    expect(exitCode).toBe(1)
  })

  it('scans a directory implicitly (no -r needed)', async () => {
    vi.mocked(statModule.stat).mockImplementation((_a, p: PathSpec | string) => {
      const orig = typeof p === 'string' ? p : p.original
      if (orig.endsWith('.json')) {
        return Promise.resolve({ name: 'f.json', type: FileType.JSON } as FileStat)
      }
      return Promise.resolve({ name: 'dir', type: FileType.DIRECTORY } as FileStat)
    })
    vi.mocked(readdirModule.readdir).mockImplementation((_a, p: PathSpec | string) => {
      const orig = typeof p === 'string' ? p : p.original
      if (orig === '/proj_x') {
        return Promise.resolve(['/proj_x/env.json', '/proj_x/domains.json'])
      }
      return Promise.resolve([])
    })
    vi.mocked(readModule.read).mockImplementation((_a, p: PathSpec | string) => {
      const orig = typeof p === 'string' ? p : p.original
      if (orig.includes('env')) return Promise.resolve(ENC.encode('NODE_ENV=prod\n'))
      return Promise.resolve(ENC.encode('apex.example.com\n'))
    })
    const { stdout, exitCode } = await runRg([path('/proj_x')], ['NODE_ENV'])
    expect(stdout).toContain('/proj_x/env.json')
    expect(stdout).not.toContain('/proj_x/domains.json')
    expect(exitCode).toBe(0)
  })
})
