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

import { spawn, type ChildProcess, type SpawnOptionsWithoutStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { ExecuteResult } from '@struktoai/mirage-core'

export interface NativeExecOptions {
  cwd: string
  env?: Record<string, string>
  timeoutMs?: number | null
  signal?: AbortSignal
}

export type NativeExecResult = ExecuteResult

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.byteLength
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

export function nativeExec(command: string, options: NativeExecOptions): Promise<NativeExecResult> {
  return new Promise((resolve, reject) => {
    const env = options.env ?? (process.env as Record<string, string>)
    const spawnOpts: SpawnOptionsWithoutStdio = {
      cwd: options.cwd,
      env,
    }
    if (options.signal !== undefined) spawnOpts.signal = options.signal
    const proc = spawn('sh', ['-c', command], spawnOpts)
    const stdoutChunks: Uint8Array[] = []
    const stderrChunks: Uint8Array[] = []
    let killed = false
    const timeoutMs = options.timeoutMs ?? null
    const timer =
      timeoutMs !== null
        ? setTimeout(() => {
            killed = true
            proc.kill('SIGKILL')
            // When sh spawns a child (e.g. `echo x && sleep 5`), SIGKILL'ing sh
            // leaves the grandchild holding the stdio fds — Node's 'close' event
            // never fires until the grandchild dies. Destroying the pipes
            // unblocks the promise so we return promptly on timeout.
            proc.stdout.destroy()
            proc.stderr.destroy()
          }, timeoutMs)
        : null

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
    })
    proc.on('error', (err: Error) => {
      if (timer !== null) clearTimeout(timer)
      if (err.name === 'AbortError' || options.signal?.aborted === true) {
        reject(new DOMException('execute aborted', 'AbortError'))
        return
      }
      reject(err)
    })
    proc.on('close', (code) => {
      if (timer !== null) clearTimeout(timer)
      // Abort wins over timeout: if both fired, surface the caller's cancel.
      if (options.signal?.aborted === true) {
        reject(new DOMException('execute aborted', 'AbortError'))
        return
      }
      if (killed) {
        // Align with Python mirage.workspace.native.native_exec: on timeout
        // the caller doesn't get the partial stdout that was collected before
        // the SIGKILL — just an empty buffer and the "timeout\n" stderr marker.
        resolve(new ExecuteResult(new Uint8Array(), new TextEncoder().encode('timeout\n'), 124))
        return
      }
      resolve(new ExecuteResult(concatChunks(stdoutChunks), concatChunks(stderrChunks), code ?? 0))
    })
  })
}

export interface NativeProcess {
  raw: ChildProcess
  stdoutStream(): Readable
  stderrStream(): Readable | null
  wait(): Promise<number>
}

export function nativeExecStream(command: string, options: NativeExecOptions): NativeProcess {
  const env = options.env ?? (process.env as Record<string, string>)
  // Note: signal intentionally NOT threaded to nativeExecStream's spawn — would
  // require an 'error' handler and abort-aware wait() to avoid (a) unhandled
  // process crash and (b) silent success on abort. Wire when a caller needs it.
  const spawnOpts: SpawnOptionsWithoutStdio = {
    cwd: options.cwd,
    env,
  }
  const proc = spawn('sh', ['-c', command], spawnOpts)
  return {
    raw: proc,
    stdoutStream(): Readable {
      return proc.stdout
    },
    stderrStream(): Readable | null {
      return proc.stderr
    },
    wait(): Promise<number> {
      return new Promise((resolve) => {
        proc.on('close', (code) => {
          resolve(code ?? 0)
        })
      })
    },
  }
}
