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

vi.mock('../../../core/posthog/read.ts', () => ({ read: vi.fn() }))
vi.mock('../../../core/posthog/readdir.ts', () => ({ readdir: vi.fn() }))
vi.mock('../../../core/posthog/stat.ts', () => ({ stat: vi.fn() }))

import { PostHogAccessor } from '../../../accessor/posthog.ts'
import type { PostHogDriver } from '../../../core/posthog/_driver.ts'
import * as readModule from '../../../core/posthog/read.ts'
import * as readdirModule from '../../../core/posthog/readdir.ts'
import * as statModule from '../../../core/posthog/stat.ts'
import { materialize } from '../../../io/types.ts'
import { resolvePostHogConfig } from '../../../resource/posthog/config.ts'
import { type FileStat, FileType, PathSpec } from '../../../types.ts'
import { POSTHOG_GREP } from './grep.ts'

const DEC = new TextDecoder()
const ENC = new TextEncoder()

class StubDriver implements PostHogDriver {
  getUser(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  listProjects(): Promise<never[]> {
    return Promise.resolve([])
  }
  getProject(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  listFeatureFlags(): Promise<{ results: unknown[] }> {
    return Promise.resolve({ results: [] })
  }
  listCohorts(): Promise<{ results: unknown[] }> {
    return Promise.resolve({ results: [] })
  }
  listDashboards(): Promise<{ results: unknown[] }> {
    return Promise.resolve({ results: [] })
  }
  listInsights(): Promise<{ results: unknown[] }> {
    return Promise.resolve({ results: [] })
  }
  listPersons(): Promise<{ results: unknown[] }> {
    return Promise.resolve({ results: [] })
  }
  close(): Promise<void> {
    return Promise.resolve()
  }
}

function makeAccessor(): PostHogAccessor {
  return new PostHogAccessor(new StubDriver(), resolvePostHogConfig({ apiKey: 't' }))
}

async function runGrep(
  paths: PathSpec[],
  texts: string[],
  flags: Record<string, string | boolean> = {},
): Promise<{ stdout: string; exitCode: number }> {
  const cmd = POSTHOG_GREP[0]
  if (cmd === undefined) throw new Error('grep not registered')
  const result = await cmd.fn(makeAccessor(), paths, texts, {
    stdin: null,
    flags,
    filetypeFns: null,
    cwd: '/',
    resource: { kind: 'posthog' } as never,
  })
  if (result === null) return { stdout: '', exitCode: 0 }
  const [out, io] = result
  const buf =
    out === null
      ? new Uint8Array()
      : out instanceof Uint8Array
        ? out
        : await materialize(out as AsyncIterable<Uint8Array>)
  return { stdout: DEC.decode(buf), exitCode: io.exitCode }
}

function path(p: string): PathSpec {
  return new PathSpec({ original: p, directory: p, resolved: true, prefix: '' })
}

describe('posthog grep', () => {
  beforeEach(() => {
    vi.mocked(readModule.read).mockReset()
    vi.mocked(readdirModule.readdir).mockReset()
    vi.mocked(statModule.stat).mockReset()
  })

  it('matches lines in a file', async () => {
    vi.mocked(statModule.stat).mockResolvedValue({
      name: 'flags.json',
      type: FileType.JSON,
    } as FileStat)
    vi.mocked(readModule.read).mockResolvedValue(ENC.encode('feature_a\nfeature_b\nother\n'))
    const { stdout, exitCode } = await runGrep([path('/proj_1/feature_flags.json')], ['feature'])
    expect(stdout).toContain('feature_a')
    expect(stdout).toContain('feature_b')
    expect(exitCode).toBe(0)
  })

  it('returns exit 1 when no match', async () => {
    vi.mocked(statModule.stat).mockResolvedValue({
      name: 'flags.json',
      type: FileType.JSON,
    } as FileStat)
    vi.mocked(readModule.read).mockResolvedValue(ENC.encode('abc\ndef\n'))
    const { exitCode } = await runGrep([path('/proj_1/feature_flags.json')], ['missing'])
    expect(exitCode).toBe(1)
  })

  it('recursively scans a directory with -r', async () => {
    vi.mocked(statModule.stat).mockImplementation((_a, p: PathSpec | string) => {
      const orig = typeof p === 'string' ? p : p.original
      if (orig.endsWith('.json')) {
        return Promise.resolve({ name: 'f.json', type: FileType.JSON } as FileStat)
      }
      return Promise.resolve({ name: 'dir', type: FileType.DIRECTORY } as FileStat)
    })
    vi.mocked(readdirModule.readdir).mockImplementation((_a, p: PathSpec | string) => {
      const orig = typeof p === 'string' ? p : p.original
      if (orig === '/proj_1') {
        return Promise.resolve(['/proj_1/flags.json', '/proj_1/cohorts.json'])
      }
      return Promise.resolve([])
    })
    vi.mocked(readModule.read).mockImplementation((_a, p: PathSpec | string) => {
      const orig = typeof p === 'string' ? p : p.original
      if (orig.includes('flags')) return Promise.resolve(ENC.encode('feature_a\n'))
      return Promise.resolve(ENC.encode('cohort_x\n'))
    })
    const { stdout, exitCode } = await runGrep([path('/proj_1')], ['feature'], { r: true })
    expect(stdout).toContain('/proj_1/flags.json')
    expect(stdout).not.toContain('/proj_1/cohorts.json')
    expect(exitCode).toBe(0)
  })
})
