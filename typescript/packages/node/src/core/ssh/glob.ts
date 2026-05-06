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

import { PathSpec } from '@struktoai/mirage-core'
import type { SSHAccessor } from '../../accessor/ssh.ts'
import { SCOPE_ERROR } from '../disk/constants.ts'
import { readdir } from './readdir.ts'

function fnmatch(name: string, pattern: string): boolean {
  let re = '^'
  for (const ch of pattern) {
    if (ch === '*') re += '.*'
    else if (ch === '?') re += '.'
    else if (/[.+^${}()|[\]\\]/.test(ch)) re += '\\' + ch
    else re += ch
  }
  re += '$'
  return new RegExp(re).test(name)
}

function basenameOf(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1)
}

export async function resolveGlob(
  accessor: SSHAccessor,
  paths: readonly PathSpec[],
): Promise<PathSpec[]> {
  const result: PathSpec[] = []
  for (const p of paths) {
    if (p.resolved) {
      result.push(p)
    } else if (p.pattern !== null && p.pattern !== '') {
      const dirSpec = new PathSpec({
        original: p.directory,
        directory: p.directory,
        resolved: true,
        prefix: p.prefix,
      })
      const entries = await readdir(accessor, dirSpec)
      const matched: PathSpec[] = []
      for (const e of entries) {
        if (fnmatch(basenameOf(e), p.pattern)) {
          matched.push(
            new PathSpec({
              original: e,
              directory: p.directory,
              resolved: true,
              prefix: p.prefix,
            }),
          )
        }
      }
      if (matched.length > SCOPE_ERROR) matched.length = SCOPE_ERROR
      result.push(...matched)
    } else {
      result.push(p)
    }
  }
  return result
}
