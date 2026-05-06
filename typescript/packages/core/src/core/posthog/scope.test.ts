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
import { PathSpec } from '../../types.ts'
import { detectScope } from './scope.ts'

function ps(p: string): PathSpec {
  return new PathSpec({ original: p, directory: p })
}

describe('posthog detectScope', () => {
  it('detects root', () => {
    expect(detectScope(ps('/')).level).toBe('root')
  })

  it('detects user file', () => {
    const s = detectScope(ps('/user.json'))
    expect(s.level).toBe('user_file')
  })

  it('detects projects dir', () => {
    expect(detectScope(ps('/projects')).level).toBe('projects_dir')
  })

  it('detects project dir', () => {
    const s = detectScope(ps('/projects/123'))
    expect(s.level).toBe('project_dir')
    expect(s.projectId).toBe('123')
  })

  it('detects project file', () => {
    const s = detectScope(ps('/projects/123/feature_flags.json'))
    expect(s.level).toBe('project_file')
    expect(s.filename).toBe('feature_flags.json')
  })

  it('rejects unknown project file', () => {
    expect(detectScope(ps('/projects/123/random.json')).level).toBe('invalid')
  })

  it('rejects too-deep paths', () => {
    expect(detectScope(ps('/projects/123/insights/extra')).level).toBe('invalid')
  })
})
