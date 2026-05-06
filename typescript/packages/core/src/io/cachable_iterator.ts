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

export class CachableAsyncIterator implements AsyncIterableIterator<Uint8Array> {
  private readonly source: AsyncIterator<Uint8Array>
  private readonly buffer: Uint8Array[] = []
  private exhaustedFlag = false
  private drainResolve: (() => void) | null = null
  private readonly drainPromise: Promise<void>

  constructor(source: AsyncIterable<Uint8Array>) {
    this.source = source[Symbol.asyncIterator]()
    this.drainPromise = new Promise<void>((resolve) => {
      this.drainResolve = resolve
    })
  }

  get exhausted(): boolean {
    return this.exhaustedFlag
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> {
    return this
  }

  async next(): Promise<IteratorResult<Uint8Array>> {
    try {
      const result = await this.source.next()
      if (result.done === true) {
        this.markExhausted()
        return { done: true, value: undefined }
      }
      this.buffer.push(result.value)
      return { done: false, value: result.value }
    } catch (err) {
      this.markExhausted()
      throw err
    }
  }

  async drain(): Promise<Uint8Array> {
    try {
      for (;;) {
        const result = await this.source.next()
        if (result.done === true) break
        this.buffer.push(result.value)
      }
    } finally {
      this.markExhausted()
    }
    return concat(this.buffer)
  }

  async drainBounded(maxBytes: number): Promise<[Uint8Array, boolean]> {
    let total = 0
    for (const c of this.buffer) total += c.byteLength
    try {
      for (;;) {
        const result = await this.source.next()
        if (result.done === true) break
        this.buffer.push(result.value)
        total += result.value.byteLength
        if (total > maxBytes) return [concat(this.buffer), false]
      }
    } finally {
      this.markExhausted()
    }
    return [concat(this.buffer), true]
  }

  async waitForDrain(): Promise<Uint8Array> {
    await this.drainPromise
    return concat(this.buffer)
  }

  private markExhausted(): void {
    this.exhaustedFlag = true
    if (this.drainResolve !== null) {
      const resolve = this.drainResolve
      this.drainResolve = null
      resolve()
    }
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
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
