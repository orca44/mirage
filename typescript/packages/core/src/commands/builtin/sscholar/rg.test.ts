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

vi.mock('../../../core/sscholar/_client.ts', () => ({
  searchSnippets: vi.fn(),
}))

import { SSCholarAccessor } from '../../../accessor/sscholar.ts'
import * as clientModule from '../../../core/sscholar/_client.ts'
import type { SSCholarDriver, SSCholarSnippetSearchResult } from '../../../core/sscholar/_driver.ts'
import { resolveSSCholarConfig } from '../../../resource/sscholar/config.ts'
import type { PathSpec } from '../../../types.ts'
import { SSCHOLAR_RG } from './rg.ts'

const DEC = new TextDecoder()

class StubDriver implements SSCholarDriver {
  getPaper(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  searchPapers(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  searchSnippets(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  getAuthor(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  getAuthorPapers(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  searchAuthors(): Promise<never> {
    return Promise.reject(new Error('stub'))
  }
  close(): Promise<void> {
    return Promise.resolve()
  }
}

function makeAccessor(): SSCholarAccessor {
  return new SSCholarAccessor(new StubDriver(), resolveSSCholarConfig({ apiKey: 'k' }))
}

async function runRg(
  paths: PathSpec[],
  texts: string[],
): Promise<{ stdout: string; exitCode: number }> {
  const cmd = SSCHOLAR_RG[0]
  if (cmd === undefined) throw new Error('rg not registered')
  const result = await cmd.fn(makeAccessor(), paths, texts, {
    stdin: null,
    flags: {},
    filetypeFns: null,
    cwd: '/',
    resource: { kind: 'sscholar' } as never,
  })
  if (result === null) return { stdout: '', exitCode: 0 }
  const [out, io] = result
  const bytes = out instanceof Uint8Array ? out : new Uint8Array()
  return { stdout: DEC.decode(bytes), exitCode: io.exitCode }
}

describe('sscholar rg', () => {
  beforeEach(() => {
    vi.mocked(clientModule.searchSnippets).mockReset()
  })

  it('formats snippet matches as paperId:text', async () => {
    const fake: SSCholarSnippetSearchResult = {
      data: [
        {
          snippet: { text: 'attention is all you need', paper: {} },
          paper: { paperId: 'p1' },
        },
        {
          snippet: { text: 'transformer architecture', paper: {} },
          paper: { paperId: 'p2' },
        },
      ],
    }
    vi.mocked(clientModule.searchSnippets).mockResolvedValue(fake)
    const { stdout, exitCode } = await runRg([], ['attention'])
    expect(vi.mocked(clientModule.searchSnippets)).toHaveBeenCalledWith(
      expect.anything(),
      'attention',
      expect.any(Number),
    )
    const lines = stdout.split('\n').filter((l) => l !== '')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('p1:\tattention is all you need')
    expect(lines[1]).toBe('p2:\ttransformer architecture')
    expect(exitCode).toBe(0)
  })

  it('returns missing-pattern stderr on empty query', async () => {
    const cmd = SSCHOLAR_RG[0]
    if (cmd === undefined) throw new Error('rg not registered')
    const result = await cmd.fn(makeAccessor(), [], [], {
      stdin: null,
      flags: {},
      filetypeFns: null,
      cwd: '/',
      resource: { kind: 'sscholar' } as never,
    })
    expect(result).not.toBeNull()
    if (result === null) return
    const io = result[1]
    expect(io.exitCode).toBe(1)
    expect(vi.mocked(clientModule.searchSnippets)).not.toHaveBeenCalled()
  })
})
