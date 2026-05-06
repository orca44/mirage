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
import { isSafeBlobPath } from './utils.ts'

describe('isSafeBlobPath', () => {
  it('accepts spaces and unicode', () => {
    expect(isSafeBlobPath('my file.txt')).toBe(true)
    expect(isSafeBlobPath('dir with space/data.txt')).toBe(true)
    expect(isSafeBlobPath('数据.txt')).toBe(true)
  })

  it('rejects parent traversal', () => {
    expect(isSafeBlobPath('../etc/passwd')).toBe(false)
    expect(isSafeBlobPath('foo/../bar')).toBe(false)
  })

  it('rejects absolute paths', () => {
    expect(isSafeBlobPath('/abs/path')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isSafeBlobPath('')).toBe(false)
  })

  it('rejects embedded NUL', () => {
    expect(isSafeBlobPath('foo\x00bar')).toBe(false)
  })

  it('rejects non-string inputs', () => {
    expect(isSafeBlobPath(null)).toBe(false)
    expect(isSafeBlobPath(undefined)).toBe(false)
    expect(isSafeBlobPath(123)).toBe(false)
    expect(isSafeBlobPath({})).toBe(false)
  })
})
