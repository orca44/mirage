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

describe.each(NATIVE_BACKENDS)('native sed (%s backend)', (kind) => {
  it('sed substitute matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('hello world\n')
      const m = await env.mirage('sed s/hello/bye/', data)
      const n = await env.native('sed s/hello/bye/', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed global substitute matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('foo boo\n')
      const m = await env.mirage('sed s/o/0/g', data)
      const n = await env.native('sed s/o/0/g', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed first-only substitute matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('foo boo\n')
      const m = await env.mirage('sed s/o/0/', data)
      const n = await env.native('sed s/o/0/', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed delete line by number matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('a\nb\nc\n')
      const m = await env.mirage('sed 2d', data)
      const n = await env.native('sed 2d', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed delete by regex matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('foo\nbar\nfoo2\n')
      const m = await env.mirage('sed /foo/d', data)
      const n = await env.native('sed /foo/d', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed on file matches native', async () => {
    const env = makeEnv(kind)
    try {
      env.createFile('f.txt', ENC.encode('hello world\n'))
      const m = await env.mirage('sed s/hello/bye/ /data/f.txt')
      const n = await env.native('sed s/hello/bye/ f.txt')
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed -n suppress matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('a\nb\nc\n')
      const m = await env.mirage('sed -n p', data)
      const n = await env.native('sed -n p', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed -n with address matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('a\nb\nc\n')
      const m = await env.mirage('sed -n 2p', data)
      const n = await env.native('sed -n 2p', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed -n range matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('a\nb\nc\nd\ne\n')
      const m = await env.mirage('sed -n 2,4p', data)
      const n = await env.native('sed -n 2,4p', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed -n regex address matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('hello\nworld\nhello again\n')
      const m = await env.mirage('sed -n /hello/p', data)
      const n = await env.native('sed -n /hello/p', data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed -n on file matches native', async () => {
    const env = makeEnv(kind)
    try {
      env.createFile('f.txt', ENC.encode('a\nb\nc\nd\ne\n'))
      const m = await env.mirage('sed -n 2,3p /data/f.txt')
      const n = await env.native('sed -n 2,3p f.txt')
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed -E extended regex matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('foo123bar\nhello\n')
      const m = await env.mirage("sed -E 's/[0-9]+/NUM/g'", data)
      const n = await env.native("sed -E 's/[0-9]+/NUM/g'", data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed -E groups matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('hello world\n')
      const m = await env.mirage("sed -E 's/(hello) (world)/\\2 \\1/'", data)
      const n = await env.native("sed -E 's/(hello) (world)/\\2 \\1/'", data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed -nE combined matches native', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('abc123\ndef\nghi456\n')
      const m = await env.mirage("sed -nE '/[0-9]+/p'", data)
      const n = await env.native("sed -nE '/[0-9]+/p'", data)
      expect(m).toBe(n)
    } finally {
      await env.cleanup()
    }
  })

  it('sed -i edits file in place', async () => {
    const env = makeEnv(kind)
    try {
      env.createFile('f.txt', ENC.encode('hello world\n'))
      await env.mirage('sed -i s/hello/bye/ /data/f.txt')
      const result = await env.mirage('cat /data/f.txt')
      expect(result).toContain('bye')
    } finally {
      await env.cleanup()
    }
  })

  it('sed -e applies expression', async () => {
    const env = makeEnv(kind)
    try {
      const data = ENC.encode('hello world\n')
      const result = await env.mirage('sed -e s/hello/bye/', data)
      expect(result).toContain('bye')
    } finally {
      await env.cleanup()
    }
  })
})
