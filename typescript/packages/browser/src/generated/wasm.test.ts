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
import { ENGINE_WASM_BASE64, GRAMMAR_WASM_BASE64 } from './wasm.ts'

function decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

describe('generated/wasm', () => {
  it('exports two non-empty base64 strings', () => {
    expect(typeof ENGINE_WASM_BASE64).toBe('string')
    expect(typeof GRAMMAR_WASM_BASE64).toBe('string')
    expect(ENGINE_WASM_BASE64.length).toBeGreaterThan(1000)
    expect(GRAMMAR_WASM_BASE64.length).toBeGreaterThan(1000)
  })

  it('decodes to bytes starting with the WASM magic header (0x00 0x61 0x73 0x6D)', () => {
    const engine = decode(ENGINE_WASM_BASE64)
    const grammar = decode(GRAMMAR_WASM_BASE64)
    expect(Array.from(engine.slice(0, 4))).toEqual([0x00, 0x61, 0x73, 0x6d])
    expect(Array.from(grammar.slice(0, 4))).toEqual([0x00, 0x61, 0x73, 0x6d])
  })
})
