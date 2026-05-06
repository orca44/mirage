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
import {
  cycleFilename,
  issueDirname,
  memberFilename,
  projectFilename,
  sanitizeName,
  splitSuffixId,
  teamDirname,
} from './pathing.ts'

describe('sanitizeName', () => {
  it('replaces unsafe chars and collapses underscores', () => {
    expect(sanitizeName('Hello / World')).toBe('Hello_World')
  })
  it('returns "unknown" for empty', () => {
    expect(sanitizeName('   ')).toBe('unknown')
  })
})

describe('splitSuffixId', () => {
  it('splits dirname into label and id', () => {
    expect(splitSuffixId('STR-1__abc123')).toEqual(['STR-1', 'abc123'])
  })
  it('splits filename with suffix', () => {
    expect(splitSuffixId('alice__u1.json', '.json')).toEqual(['alice', 'u1'])
  })
  it('throws when suffix mismatch', () => {
    expect(() => splitSuffixId('alice__u1', '.json')).toThrow(/ENOENT/)
  })
})

describe('dirnames and filenames', () => {
  it('builds team dirname with key + name', () => {
    expect(teamDirname({ id: 't1', key: 'ENG', name: 'Engineering' })).toBe('ENG__Engineering__t1')
  })
  it('builds team dirname with just key when name absent', () => {
    expect(teamDirname({ id: 't1', key: 'ENG' })).toBe('ENG__t1')
  })
  it('builds team dirname collapses dup', () => {
    expect(teamDirname({ id: 't1', key: 'ENG', name: 'ENG' })).toBe('ENG__t1')
  })
  it('builds member filename from displayName', () => {
    expect(memberFilename({ id: 'u1', displayName: 'Alice', name: 'Alice C' })).toBe(
      'Alice__u1.json',
    )
  })
  it('builds member filename falls back to email', () => {
    expect(memberFilename({ id: 'u1', email: 'alice@example.com' })).toBe(
      'alice_example.com__u1.json',
    )
  })
  it('builds issue dirname from identifier', () => {
    expect(issueDirname({ id: 'i1', identifier: 'STR-42' })).toBe('STR-42__i1')
  })
  it('builds project filename', () => {
    expect(projectFilename({ id: 'p1', name: 'Q1 Roadmap' })).toBe('Q1_Roadmap__p1.json')
  })
  it('builds cycle filename', () => {
    expect(cycleFilename({ id: 'c1', name: 'Sprint 12' })).toBe('Sprint_12__c1.json')
  })
})
