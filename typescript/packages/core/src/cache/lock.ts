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

export class KeyLock {
  private readonly tails = new Map<string, Promise<void>>()

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = prev.then(() => gate)
    this.tails.set(key, tail)
    try {
      await prev
      return await fn()
    } finally {
      release()
      if (this.tails.get(key) === tail) {
        this.tails.delete(key)
      }
    }
  }

  discard(key: string): void {
    this.tails.delete(key)
  }

  clear(): void {
    this.tails.clear()
  }
}
