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
import { IOResult } from '../io/types.ts'
import { applyBarrier, BarrierPolicy } from './barrier.ts'

async function* fromChunks(chunks: Uint8Array[]): AsyncIterable<Uint8Array> {
  await Promise.resolve()
  for (const c of chunks) yield c
}

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe('applyBarrier', () => {
  it('STREAM returns the stream untouched', async () => {
    const io = new IOResult()
    const stream = fromChunks([encode('a')])
    const result = await applyBarrier(stream, io, BarrierPolicy.STREAM)
    expect(result).toBe(stream)
  })

  it('STATUS drains the stream and returns null', async () => {
    const io = new IOResult()
    const result = await applyBarrier(fromChunks([encode('a')]), io, BarrierPolicy.STATUS)
    expect(result).toBeNull()
  })

  it('VALUE materializes the stream into bytes', async () => {
    const io = new IOResult()
    const result = await applyBarrier(fromChunks([encode('hi')]), io, BarrierPolicy.VALUE)
    expect(result).toEqual(encode('hi'))
  })

  it('VALUE returns empty bytes for null input', async () => {
    const io = new IOResult()
    const result = await applyBarrier(null, io, BarrierPolicy.VALUE)
    expect(result).toEqual(new Uint8Array())
  })
})
