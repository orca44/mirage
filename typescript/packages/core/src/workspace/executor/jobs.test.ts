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
import { IOResult } from '../../io/types.ts'
import { JobStatus, JobTable, type JobTaskResult } from '../../shell/job_table.ts'
import { ExecutionNode } from '../types.ts'
import { handleJobs, handleKill, handlePs, handleWait } from './jobs.ts'

function settled(result: JobTaskResult): Promise<JobTaskResult> {
  return Promise.resolve(result)
}

function pending(): { task: Promise<JobTaskResult>; abort: AbortController } {
  const abort = new AbortController()
  const task = new Promise<JobTaskResult>((resolve, reject) => {
    abort.signal.addEventListener('abort', () => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      reject(err)
    })
    void resolve
  })
  task.catch(() => {
    // silence unhandled
  })
  return { task, abort }
}

function decode(b: Uint8Array): string {
  return new TextDecoder().decode(b)
}

describe('handleWait', () => {
  it('waits for all jobs when no id given', async () => {
    const jt = new JobTable()
    const j1 = jt.submit({
      command: 'a',
      task: settled([null, new IOResult(), new ExecutionNode()]),
      abort: new AbortController(),
      cwd: '/',
    })
    const [, io, exec] = await handleWait(jt, ['wait'])
    expect(io.exitCode).toBe(0)
    expect(exec.command).toBe('wait')
    await jt.wait(j1.id)
  })

  it('rejects non-numeric job id', async () => {
    const jt = new JobTable()
    const [, io] = await handleWait(jt, ['wait', 'abc'])
    expect(io.exitCode).toBe(1)
    expect(decode(io.stderr as Uint8Array)).toMatch(/invalid job id/)
  })

  it('rejects unknown job id', async () => {
    const jt = new JobTable()
    const [, io] = await handleWait(jt, ['wait', '999'])
    expect(io.exitCode).toBe(1)
    expect(decode(io.stderr as Uint8Array)).toMatch(/no such job/)
  })

  it('awaits a specific job and returns its exit code', async () => {
    const jt = new JobTable()
    const io = new IOResult({ stderr: new TextEncoder().encode('done'), exitCode: 3 })
    const stdout = new TextEncoder().encode('out')
    const j = jt.submit({
      command: 'foo',
      task: settled([stdout, io, new ExecutionNode()]),
      abort: new AbortController(),
      cwd: '/',
    })
    const [resStdout, resIo] = await handleWait(jt, ['wait', j.id.toString()])
    expect(resStdout).toEqual(stdout)
    expect(resIo.exitCode).toBe(3)
  })

  it('accepts %N job id syntax', async () => {
    const jt = new JobTable()
    const j = jt.submit({
      command: 'foo',
      task: settled([null, new IOResult(), new ExecutionNode()]),
      abort: new AbortController(),
      cwd: '/',
    })
    const [, io] = await handleWait(jt, ['wait', `%${j.id.toString()}`])
    expect(io.exitCode).toBe(0)
  })
})

describe('handleKill', () => {
  it('rejects missing job id arg', () => {
    const jt = new JobTable()
    const [, io] = handleKill(jt, ['kill'])
    expect(io.exitCode).toBe(1)
    expect(decode(io.stderr as Uint8Array)).toMatch(/usage/)
  })

  it('rejects non-numeric job id', () => {
    const jt = new JobTable()
    const [, io] = handleKill(jt, ['kill', 'abc'])
    expect(io.exitCode).toBe(1)
    expect(decode(io.stderr as Uint8Array)).toMatch(/invalid job id/)
  })

  it('rejects unknown job id', () => {
    const jt = new JobTable()
    const [, io] = handleKill(jt, ['kill', '999'])
    expect(io.exitCode).toBe(1)
    expect(decode(io.stderr as Uint8Array)).toMatch(/no such job/)
  })

  it('kills a known job and returns 0', () => {
    const jt = new JobTable()
    const { task, abort } = pending()
    const j = jt.submit({ command: 'sleep', task, abort, cwd: '/' })
    const [, io] = handleKill(jt, ['kill', j.id.toString()])
    expect(io.exitCode).toBe(0)
    expect(jt.get(j.id)?.status).toBe(JobStatus.KILLED)
  })
})

describe('handleJobs', () => {
  it('returns empty output when no jobs', () => {
    const jt = new JobTable()
    const [out, io] = handleJobs(jt, ['jobs'])
    expect((out as Uint8Array).byteLength).toBe(0)
    expect(io.exitCode).toBe(0)
  })

  it('lists jobs with id, status, command', async () => {
    const jt = new JobTable()
    const j = jt.submit({
      command: 'foo',
      task: settled([null, new IOResult(), new ExecutionNode()]),
      abort: new AbortController(),
      cwd: '/',
    })
    const { task, abort } = pending()
    jt.submit({ command: 'bar', task, abort, cwd: '/' })
    await jt.wait(j.id)
    const [out] = handleJobs(jt, ['jobs'])
    const text = decode(out as Uint8Array)
    expect(text).toMatch(/\[1\] completed foo/)
    expect(text).toMatch(/\[2\] running bar/)
  })

  it('removes completed jobs from the table', async () => {
    const jt = new JobTable()
    const j = jt.submit({
      command: 'foo',
      task: settled([null, new IOResult(), new ExecutionNode()]),
      abort: new AbortController(),
      cwd: '/',
    })
    await jt.wait(j.id)
    handleJobs(jt, ['jobs'])
    expect(jt.listJobs()).toHaveLength(0)
  })
})

describe('handlePs', () => {
  it('lists only running jobs', () => {
    const jt = new JobTable()
    const { task, abort } = pending()
    jt.submit({ command: 'sleep', task, abort, cwd: '/' })
    const [out] = handlePs(jt, ['ps'])
    expect(decode(out as Uint8Array)).toMatch(/1\tsleep/)
  })

  it('returns empty output when no running jobs', () => {
    const jt = new JobTable()
    const [out] = handlePs(jt, ['ps'])
    expect((out as Uint8Array).byteLength).toBe(0)
  })
})
