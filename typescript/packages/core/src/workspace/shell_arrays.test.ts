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
import { makeIntegrationWS, run } from './fixtures/integration_fixture.ts'

const CASES: [string, string][] = [
  ['a=(one two three); echo "${a[0]}"', 'one\n'],
  ['a=(one two three); echo "${a[1]}"', 'two\n'],
  ['a=(one two three); echo "${a[2]}"', 'three\n'],
  ['a=(one two three); echo "${a[@]}"', 'one two three\n'],
  ['a=(one two three); echo "${a[*]}"', 'one two three\n'],
  ['a=(one two three); echo "${#a[@]}"', '3\n'],
  ['a=(); echo "${#a[@]}"', '0\n'],
  ['a=(x y z); for i in "${a[@]}"; do echo $i; done', 'x\ny\nz\n'],
  ['declare -a arr=(a b c); echo "${arr[@]}"', 'a b c\n'],
  ['a=("hello world" foo); echo "${a[0]}"', 'hello world\n'],
]

describe('shell arrays', () => {
  for (const [cmd, expected] of CASES) {
    it(cmd, async () => {
      const { ws } = await makeIntegrationWS()
      try {
        expect(await run(ws, cmd)).toBe(expected)
      } finally {
        await ws.close()
      }
    })
  }
})
