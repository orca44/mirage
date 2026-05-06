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
import { makeEnv, NATIVE_BACKENDS } from './native_fixture.ts'

const ENC = new TextEncoder()

describe.each(NATIVE_BACKENDS)('native tr (%s backend)', (kind) => {
  it('tr basic matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('hello\n')
      const m = await env.mirage('tr h H', data)
      const n = await env.native('tr h H', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('tr -d matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('hello world\n')
      const m = await env.mirage('tr -d aeiou', data)
      const n = await env.native('tr -d aeiou', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('tr -s matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('baanaanaa\n')
      const m = await env.mirage('tr -s a', data)
      const n = await env.native('tr -s a', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('tr range a-z A-Z matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('hello\n')
      const m = await env.mirage('tr a-z A-Z', data)
      const n = await env.native('tr a-z A-Z', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('tr -cd matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('Hello World 123\n')
      const m = await env.mirage('tr -cd a-z', data)
      const n = await env.native('tr -cd a-z', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })
})
