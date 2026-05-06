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

import { describe, expect, it, vi } from 'vitest'
import type * as DriveModule from '../google/drive.ts'

vi.mock('../google/drive.ts', async () => {
  const actual = await vi.importActual<typeof DriveModule>('../google/drive.ts')
  return { ...actual, listFiles: vi.fn() }
})

import { GDriveAccessor } from '../../accessor/gdrive.ts'
import { RAMIndexCacheStore } from '../../cache/index/ram.ts'
import { PathSpec } from '../../types.ts'
import type { TokenManager } from '../google/_client.ts'
import * as drive from '../google/drive.ts'
import { readdir } from './readdir.ts'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

const STUB_TOKEN_MANAGER = {} as TokenManager

function makeAccessor(): GDriveAccessor {
  return new GDriveAccessor({ tokenManager: STUB_TOKEN_MANAGER })
}

describe('readdir parent recursion', () => {
  it('repopulates evicted subfolder entry by refetching parent', async () => {
    vi.mocked(drive.listFiles).mockImplementation((_tm, opts) => {
      if (opts?.folderId === 'root') {
        return Promise.resolve([
          {
            id: 'folder1',
            name: 'docs',
            mimeType: FOLDER_MIME,
            modifiedTime: '2026-04-01T00:00:00.000Z',
          },
        ])
      }
      if (opts?.folderId === 'folder1') {
        return Promise.resolve([
          {
            id: 'f2',
            name: 'notes.txt',
            mimeType: 'text/plain',
            modifiedTime: '2026-04-01T00:00:00.000Z',
          },
        ])
      }
      throw new Error(`unexpected folderId=${String(opts?.folderId)}`)
    })

    const accessor = makeAccessor()
    const index = new RAMIndexCacheStore()
    const out = await readdir(
      accessor,
      new PathSpec({ original: '/docs', directory: '/docs' }),
      index,
    )
    expect(out).toContain('/docs/notes.txt')
  })

  it('raises ENOENT when subfolder missing even after recursion', async () => {
    vi.mocked(drive.listFiles).mockImplementation((_tm, opts) => {
      if (opts?.folderId === 'root') {
        return Promise.resolve([
          {
            id: 'f1',
            name: 'other.txt',
            mimeType: 'text/plain',
            modifiedTime: '2026-04-01T00:00:00.000Z',
          },
        ])
      }
      throw new Error(`should not list folderId=${String(opts?.folderId)}`)
    })

    const accessor = makeAccessor()
    const index = new RAMIndexCacheStore()
    await expect(
      readdir(accessor, new PathSpec({ original: '/docs', directory: '/docs' }), index),
    ).rejects.toThrow(/ENOENT/)
  })
})
