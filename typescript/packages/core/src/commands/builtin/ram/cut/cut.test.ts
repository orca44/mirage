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
import { materialize } from '../../../../io/types.ts'
import { RAMResource } from '../../../../resource/ram/ram.ts'
import { RAM_CUT } from './cut.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder()

async function runCut(
  stdin: Uint8Array | null,
  flags: Record<string, string | boolean>,
): Promise<string> {
  const resource = new RAMResource()
  const cmd = RAM_CUT[0]
  if (cmd === undefined) throw new Error('cut not registered')
  const result = await cmd.fn((resource as { accessor?: unknown }).accessor as never, [], [], {
    stdin,
    flags,
    filetypeFns: null,
    cwd: '/',
    resource,
  })
  if (result === null) return ''
  const [out] = result
  if (out === null) return ''
  const buf = out instanceof Uint8Array ? out : await materialize(out as AsyncIterable<Uint8Array>)
  return DEC.decode(buf)
}

describe('cut', () => {
  it('-f with default tab', async () => {
    expect(await runCut(ENC.encode('a\tb\tc\n'), { f: '2' })).toBe('b\n')
  })

  it('-f -d :', async () => {
    expect(await runCut(ENC.encode('a:b:c\nd:e:f\n'), { f: '1', d: ':' })).toBe('a\nd\n')
  })

  it('-c byte range', async () => {
    expect(await runCut(ENC.encode('hello world\n'), { c: '1-5' })).toBe('hello\n')
  })

  it('-f with complement', async () => {
    expect(await runCut(ENC.encode('a:b:c:d\n'), { d: ':', f: '2', complement: true })).toBe(
      'a:c:d\n',
    )
  })

  it('-f,-f picks multiple fields', async () => {
    expect(await runCut(ENC.encode('a,b,c,d\n'), { d: ',', f: '1,3' })).toBe('a,c\n')
  })

  it('-f with range', async () => {
    expect(await runCut(ENC.encode('a,b,c,d,e\n'), { d: ',', f: '2-4' })).toBe('b,c,d\n')
  })

  it('-z zero-terminated', async () => {
    expect(await runCut(ENC.encode('a:b\x00c:d\x00'), { d: ':', f: '1', z: true })).toBe(
      'a\x00c\x00',
    )
  })

  it('missing stdin returns error', async () => {
    const resource = new RAMResource()
    const cmd = RAM_CUT[0]
    if (cmd === undefined) throw new Error('cut not registered')
    const result = await cmd.fn((resource as { accessor?: unknown }).accessor as never, [], [], {
      stdin: null,
      flags: { f: '1' },
      filetypeFns: null,
      cwd: '/',
      resource,
    })
    if (result === null) throw new Error('result null')
    const [, ioResult] = result
    expect(ioResult.exitCode).toBe(1)
    const stderr = ioResult.stderr
    const errBytes =
      stderr === null
        ? new Uint8Array()
        : stderr instanceof Uint8Array
          ? stderr
          : await materialize(stderr)
    expect(DEC.decode(errBytes)).toMatch(/missing operand/)
  })
})
