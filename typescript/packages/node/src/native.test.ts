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

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nativeExec, nativeExecStream } from './native.ts'

const DEC = new TextDecoder()

function withTmpdir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'mirage-native-'))
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true })
  })
}

describe('nativeExec', () => {
  it('captures stdout and exit 0 on echo', async () => {
    await withTmpdir(async (dir) => {
      const { stdout, exitCode } = await nativeExec('echo hello', { cwd: dir })
      expect(DEC.decode(stdout)).toBe('hello\n')
      expect(exitCode).toBe(0)
    })
  })

  it('honors shell pipes', async () => {
    await withTmpdir(async (dir) => {
      const { stdout, exitCode } = await nativeExec("echo hello world | tr ' ' '\\n' | sort", {
        cwd: dir,
      })
      const text = DEC.decode(stdout)
      expect(text).toContain('hello')
      expect(text).toContain('world')
      expect(exitCode).toBe(0)
    })
  })

  it('honors redirects and reads files back', async () => {
    await withTmpdir(async (dir) => {
      const { stdout, exitCode } = await nativeExec(
        "echo 'test content' > file.txt && cat file.txt",
        { cwd: dir },
      )
      expect(DEC.decode(stdout)).toBe('test content\n')
      expect(exitCode).toBe(0)
    })
  })

  it('propagates nonzero exit codes', async () => {
    await withTmpdir(async (dir) => {
      const { exitCode } = await nativeExec('false', { cwd: dir })
      expect(exitCode).not.toBe(0)
    })
  })

  it('captures stderr', async () => {
    await withTmpdir(async (dir) => {
      const { stderr, exitCode } = await nativeExec('echo error >&2', { cwd: dir })
      expect(DEC.decode(stderr)).toContain('error')
      expect(exitCode).toBe(0)
    })
  })

  it('returns exit 124 + "timeout\\n" stderr when timeout fires', async () => {
    await withTmpdir(async (dir) => {
      const { stderr, exitCode } = await nativeExec('sleep 5', {
        cwd: dir,
        timeoutMs: 100,
      })
      expect(exitCode).toBe(124)
      expect(DEC.decode(stderr)).toBe('timeout\n')
    })
  })

  it('discards partial stdout on timeout (Python-aligned)', async () => {
    await withTmpdir(async (dir) => {
      // This command prints 'early' immediately, then sleeps past the timeout.
      // Python native_exec returns b"" on timeout; TS must match.
      const { stdout, exitCode } = await nativeExec('echo early && sleep 5', {
        cwd: dir,
        timeoutMs: 200,
      })
      expect(exitCode).toBe(124)
      expect(stdout.byteLength).toBe(0)
    })
  })

  it('aborts a long-running subprocess and rejects with AbortError', async () => {
    await withTmpdir(async (dir) => {
      const controller = new AbortController()
      const p = nativeExec('sleep 30', { cwd: dir, signal: controller.signal })
      setTimeout(() => {
        controller.abort()
      }, 100)
      await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    })
  })

  it('returns normally when signal is provided but never aborted', async () => {
    await withTmpdir(async (dir) => {
      const controller = new AbortController()
      const result = await nativeExec('echo hi', {
        cwd: dir,
        signal: controller.signal,
      })
      expect(result.exitCode).toBe(0)
      expect(DEC.decode(result.stdout)).toBe('hi\n')
    })
  })
})

describe('nativeExecStream', () => {
  it('yields stdout in chunks and reports exit code', async () => {
    await withTmpdir(async (dir) => {
      const proc = nativeExecStream('seq 1 5', { cwd: dir })
      const chunks: Uint8Array[] = []
      for await (const chunk of proc.stdoutStream()) {
        chunks.push(chunk as Uint8Array)
      }
      const total = Buffer.concat(chunks).toString('utf8')
      expect(total).toBe('1\n2\n3\n4\n5\n')
      const code = await proc.wait()
      expect(code).toBe(0)
    })
  })
})
