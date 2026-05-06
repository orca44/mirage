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

describe.each(NATIVE_BACKENDS)('native unzip flags (%s backend)', (kind) => {
  it('unzip -q quiet', async () => {
    const env = makeEnv(kind)
    try {
      env.createFile('a.txt', ENC.encode('hello'))
      await env.mirage('zip /data/out.zip /data/a.txt')
      const result = await env.mirage('unzip -q -d /data/ext /data/out.zip')
      expect(result.trim() === '' || !result.includes('inflating')).toBe(true)
    } finally {
      await env.cleanup()
    }
  })

  it('unzip -t test archive', async () => {
    const env = makeEnv(kind)
    try {
      env.createFile('a.txt', ENC.encode('hello'))
      await env.mirage('zip /data/out.zip /data/a.txt')
      const result = await env.mirage('unzip -t /data/out.zip')
      const ok =
        result.includes('OK') || result.toLowerCase().includes('ok') || result.includes('No errors')
      expect(ok).toBe(true)
    } finally {
      await env.cleanup()
    }
  })

  it('unzip -l list archive', async () => {
    const env = makeEnv(kind)
    try {
      env.createFile('a.txt', ENC.encode('hello'))
      await env.mirage('zip /data/out.zip /data/a.txt')
      const result = await env.mirage('unzip -l /data/out.zip')
      expect(result).toContain('a.txt')
    } finally {
      await env.cleanup()
    }
  })

  it('unzip -p pipe to stdout', async () => {
    const env = makeEnv(kind)
    try {
      env.createFile('a.txt', ENC.encode('hello'))
      await env.mirage('zip /data/out.zip /data/a.txt')
      const result = await env.mirage('unzip -p /data/out.zip')
      expect(result).toContain('hello')
    } finally {
      await env.cleanup()
    }
  })

  it('unzip -o overwrite', async () => {
    const env = makeEnv(kind)
    try {
      env.createFile('a.txt', ENC.encode('hello'))
      await env.mirage('zip /data/out.zip /data/a.txt')
      await env.mirage('unzip -o /data/out.zip')
      const result = await env.mirage('ls /data')
      expect(result).toContain('a.txt')
    } finally {
      await env.cleanup()
    }
  })
})
