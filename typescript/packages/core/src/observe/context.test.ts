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

/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest'
import { record, runWithRecording, setVirtualPrefix } from './context.ts'

describe('runWithRecording / record / setVirtualPrefix', () => {
  it('record outside recording scope is a no-op', () => {
    record('read', '/a.txt', 's3', 100, 0)
  })

  it('captures a single record within scope', async () => {
    const [, records] = await runWithRecording(async () => {
      record('read', '/a.txt', 's3', 100, 0)
    })
    expect(records).toHaveLength(1)
    expect(records[0]?.op).toBe('read')
    expect(records[0]?.bytes).toBe(100)
  })

  it('records after scope ends are dropped', async () => {
    const [, records] = await runWithRecording(async () => {
      record('read', '/a.txt', 's3', 100, 0)
    })
    record('read', '/b.txt', 's3', 200, 0)
    expect(records).toHaveLength(1)
  })

  it('captures multiple records with correct sources', async () => {
    const [, records] = await runWithRecording(async () => {
      record('read', '/a.txt', 's3', 100, 0)
      record('write', '/b.txt', 'ram', 50, 0)
    })
    expect(records).toHaveLength(2)
    expect(records[0]?.source).toBe('s3')
    expect(records[1]?.source).toBe('ram')
  })

  it('prepends virtual prefix when path lacks it', async () => {
    const [, records] = await runWithRecording(async () => {
      setVirtualPrefix('/s3')
      record('read', '/data/file.json', 's3', 100, 0)
    })
    expect(records[0]?.path).toBe('/s3/data/file.json')
  })

  it('leaves path unchanged when prefix is empty', async () => {
    const [, records] = await runWithRecording(async () => {
      record('read', '/data/file.json', 's3', 100, 0)
    })
    expect(records[0]?.path).toBe('/data/file.json')
  })

  it('does not double-apply prefix when path already has it', async () => {
    const [, records] = await runWithRecording(async () => {
      setVirtualPrefix('/s3')
      record('read', '/s3/data/file.json', 's3', 100, 0)
    })
    expect(records[0]?.path).toBe('/s3/data/file.json')
  })
})
