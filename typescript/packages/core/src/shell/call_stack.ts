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

export interface CallFrameInit {
  positional?: string[]
  locals?: Record<string, string>
  functionName?: string
  loopLevel?: number
}

export class CallFrame {
  positional: string[]
  locals: Record<string, string>
  functionName: string
  loopLevel: number

  constructor(init: CallFrameInit = {}) {
    this.positional = init.positional ?? []
    this.locals = init.locals ?? {}
    this.functionName = init.functionName ?? ''
    this.loopLevel = init.loopLevel ?? 0
  }
}

export class CallStack {
  private readonly frames: CallFrame[] = [new CallFrame()]

  get current(): CallFrame {
    const frame = this.frames[this.frames.length - 1]
    if (frame === undefined) throw new Error('call stack is empty')
    return frame
  }

  push(positional: string[] = [], functionName = ''): void {
    this.frames.push(new CallFrame({ positional, functionName }))
  }

  pop(): CallFrame {
    if (this.frames.length <= 1) return this.current
    const popped = this.frames.pop()
    if (popped === undefined) throw new Error('pop on empty stack')
    return popped
  }

  get depth(): number {
    return this.frames.length
  }

  getPositional(index: number): string {
    const pos = this.current.positional
    if (index > 0 && index <= pos.length) return pos[index - 1] ?? ''
    return ''
  }

  getAllPositional(): string[] {
    return this.current.positional
  }

  getPositionalCount(): number {
    return this.current.positional.length
  }

  shift(n = 1): void {
    this.current.positional = this.current.positional.slice(n)
  }

  setPositional(values: string[]): void {
    this.current.positional = values
  }

  setLocal(name: string, value: string): void {
    this.current.locals[name] = value
  }

  getLocal(name: string): string | null {
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const frame = this.frames[i]
      if (frame !== undefined && name in frame.locals) {
        return frame.locals[name] ?? null
      }
    }
    return null
  }
}
