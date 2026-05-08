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
  ['X=hi; echo "${X:-fallback}"', 'hi\n'],
  ['echo "${UNSET:-fallback}"', 'fallback\n'],
  ['X=""; echo "${X:-fallback}"', 'fallback\n'],
  ['X=""; echo "${X-fallback}"', '\n'],
  ['echo "${UNSET-fallback}"', 'fallback\n'],
  ['X=hi; echo "${X:+yes}"', 'yes\n'],
  ['echo "${UNSET:+yes}"', '\n'],
  ['X=""; echo "${X:+yes}"', '\n'],
  ['X=""; echo "${X+yes}"', 'yes\n'],
  ['X=hello; echo "${#X}"', '5\n'],
  ['X=""; echo "${#X}"', '0\n'],
  ['X=hello; echo "${X:1:3}"', 'ell\n'],
  ['X=hello; echo "${X:1}"', 'ello\n'],
  ['X=hello; echo "${X: -3}"', 'llo\n'],
  ['X=foobar; echo "${X#foo}"', 'bar\n'],
  ['X=foobar; echo "${X%bar}"', 'foo\n'],
  ['X=a/b/c/d; echo "${X##*/}"', 'd\n'],
  ['X=a/b/c/d; echo "${X%%/*}"', 'a\n'],
  ['X=a/b/c/d; echo "${X#*/}"', 'b/c/d\n'],
  ['X=a/b/c/d; echo "${X%/*}"', 'a/b/c\n'],
  ['X=foobarfoo; echo "${X/foo/baz}"', 'bazbarfoo\n'],
  ['X=foobarfoo; echo "${X//foo/baz}"', 'bazbarbaz\n'],
  ['X=foobar; echo "${X/foo/}"', 'bar\n'],
  ['X=hello; echo "${X^^}"', 'HELLO\n'],
  ['X=HELLO; echo "${X,,}"', 'hello\n'],
  ['X=hello; echo "${X^}"', 'Hello\n'],
  ['X=HELLO; echo "${X,}"', 'hELLO\n'],
  ['X=hello; Y=X; echo "${!Y}"', 'hello\n'],
]

describe('parameter expansion operators', () => {
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
