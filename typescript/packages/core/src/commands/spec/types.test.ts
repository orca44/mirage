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
import { CommandSpec, Operand, OperandKind, Option, ParsedArgs } from './types.ts'

describe('OperandKind', () => {
  it('has NONE/PATH/TEXT', () => {
    expect(OperandKind.NONE).toBe('none')
    expect(OperandKind.PATH).toBe('path')
    expect(OperandKind.TEXT).toBe('text')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(OperandKind)).toBe(true)
  })
})

describe('Option', () => {
  it('defaults value_kind to NONE', () => {
    const o = new Option({ short: '-l' })
    expect(o.valueKind).toBe(OperandKind.NONE)
    expect(o.short).toBe('-l')
    expect(o.long).toBeNull()
  })

  it('is frozen', () => {
    const o = new Option()
    expect(Object.isFrozen(o)).toBe(true)
  })
})

describe('Operand', () => {
  it('defaults kind to PATH', () => {
    expect(new Operand().kind).toBe(OperandKind.PATH)
  })
})

describe('CommandSpec', () => {
  it('defaults to empty options/positional + null rest', () => {
    const s = new CommandSpec()
    expect(s.options).toEqual([])
    expect(s.positional).toEqual([])
    expect(s.rest).toBeNull()
  })
})

describe('CommandSpec.description', () => {
  it('defaults to null', () => {
    const spec = new CommandSpec()
    expect(spec.description).toBeNull()
  })

  it('round-trips an explicit value', () => {
    const spec = new CommandSpec({ description: 'do a thing' })
    expect(spec.description).toBe('do a thing')
  })
})

describe('Option.description', () => {
  it('defaults to null', () => {
    const opt = new Option({ short: 'n' })
    expect(opt.description).toBeNull()
  })

  it('round-trips an explicit value', () => {
    const opt = new Option({ short: 'n', description: 'number lines' })
    expect(opt.description).toBe('number lines')
  })
})

describe('ParsedArgs helpers', () => {
  const parsed = new ParsedArgs({
    flags: { '-l': true, '--name': 'README' },
    args: [
      ['/ram/x', OperandKind.PATH],
      ['literal', OperandKind.TEXT],
      ['/ram/y', OperandKind.PATH],
    ],
    pathFlagValues: ['/ram/z'],
  })

  it('paths() returns PATH args only', () => {
    expect(parsed.paths()).toEqual(['/ram/x', '/ram/y'])
  })

  it('texts() returns TEXT args only', () => {
    expect(parsed.texts()).toEqual(['literal'])
  })

  it('routingPaths() combines paths() and pathFlagValues', () => {
    expect(parsed.routingPaths()).toEqual(['/ram/x', '/ram/y', '/ram/z'])
  })

  it('flag() reads with fallback', () => {
    expect(parsed.flag('-l')).toBe(true)
    expect(parsed.flag('--missing', 'def')).toBe('def')
  })
})
