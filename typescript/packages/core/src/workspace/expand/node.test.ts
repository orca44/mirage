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
import { safeEval } from './node.ts'

describe('safeEval', () => {
  it('evaluates basic integer math', () => {
    expect(safeEval('1 + 2')).toBe(3)
    expect(safeEval('10 - 3')).toBe(7)
    expect(safeEval('4 * 5')).toBe(20)
    expect(safeEval('20 / 4')).toBe(5)
    expect(safeEval('10 % 3')).toBe(1)
  })

  it('handles precedence', () => {
    expect(safeEval('1 + 2 * 3')).toBe(7)
    expect(safeEval('(1 + 2) * 3')).toBe(9)
  })

  it('supports power', () => {
    expect(safeEval('2 ** 8')).toBe(256)
  })

  it('right-associative power', () => {
    expect(safeEval('2 ** 3 ** 2')).toBe(512)
  })

  it('unary minus', () => {
    expect(safeEval('-5')).toBe(-5)
    expect(safeEval('-(1 + 2)')).toBe(-3)
  })

  it('comparisons return 1/0', () => {
    expect(safeEval('3 > 2')).toBe(1)
    expect(safeEval('3 < 2')).toBe(0)
    expect(safeEval('2 == 2')).toBe(1)
    expect(safeEval('2 != 2')).toBe(0)
  })

  it('logical operators', () => {
    expect(safeEval('1 && 1')).toBe(1)
    expect(safeEval('1 && 0')).toBe(0)
    expect(safeEval('0 || 1')).toBe(1)
  })

  it('throws on unsafe syntax', () => {
    expect(() => safeEval('alert("x")')).toThrow(/unsafe arithmetic/)
    expect(() => safeEval('foo.bar')).toThrow(/unsafe arithmetic/)
  })

  it('throws on unbalanced parens', () => {
    expect(() => safeEval('(1 + 2')).toThrow()
  })
})
