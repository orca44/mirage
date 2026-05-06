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
import { jqEval } from './eval.ts'
import { JQ_EMPTY, concatBytes, formatJqOutput } from './format.ts'

const DEC = new TextDecoder()

describe('formatJqOutput', () => {
  it('returns empty bytes for JQ_EMPTY sentinel', () => {
    expect(formatJqOutput(JQ_EMPTY, false, false, false)).toEqual(new Uint8Array(0))
    expect(formatJqOutput(JQ_EMPTY, true, true, true)).toEqual(new Uint8Array(0))
  })

  it('serializes a single value compactly', () => {
    expect(DEC.decode(formatJqOutput({ a: 1 }, false, true, false))).toBe('{"a":1}\n')
  })

  it('emits raw strings without JSON quoting when raw=true', () => {
    expect(DEC.decode(formatJqOutput('hello', true, true, false))).toBe('hello\n')
  })

  it('spreads top-level arrays into one line per item', () => {
    expect(DEC.decode(formatJqOutput([1, 2, 3], false, true, true))).toBe('1\n2\n3\n')
  })

  it('keeps array as one value when spread is false', () => {
    expect(DEC.decode(formatJqOutput([1, 2, 3], false, true, false))).toBe('[1,2,3]\n')
  })
})

describe('jq DropItem regression', () => {
  it('zero-output expression returns JQ_EMPTY, not a thrown error', async () => {
    const msg = { id: 'x', subject: 'hi', body_text: '...' }
    const result = await jqEval(msg, '.attachments[]?')
    expect(result).toBe(JQ_EMPTY)
    expect(formatJqOutput(result, true, true, true)).toEqual(new Uint8Array(0))
  })

  it('select with no match returns JQ_EMPTY', async () => {
    const result = await jqEval({ x: 1 }, 'select(.x > 100)')
    expect(result).toBe(JQ_EMPTY)
    expect(formatJqOutput(result, false, true, false)).toEqual(new Uint8Array(0))
  })
})

describe('concatBytes', () => {
  it('concatenates byte arrays in order', () => {
    const a = new Uint8Array([1, 2, 3])
    const b = new Uint8Array([4, 5])
    expect(Array.from(concatBytes([a, b]))).toEqual([1, 2, 3, 4, 5])
  })

  it('returns empty array for empty input', () => {
    expect(concatBytes([])).toEqual(new Uint8Array(0))
  })
})
