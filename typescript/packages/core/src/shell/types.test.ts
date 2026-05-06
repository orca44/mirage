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
import { NodeType } from './types.ts'

describe('NodeType', () => {
  it('has the load-bearing grammar node types mirroring tree-sitter-bash', () => {
    expect(NodeType.PROGRAM).toBe('program')
    expect(NodeType.COMMAND).toBe('command')
    expect(NodeType.PIPELINE).toBe('pipeline')
    expect(NodeType.REDIRECTED_STATEMENT).toBe('redirected_statement')
    expect(NodeType.COMMAND_NAME).toBe('command_name')
    expect(NodeType.WORD).toBe('word')
    expect(NodeType.STRING).toBe('string')
    expect(NodeType.SIMPLE_EXPANSION).toBe('simple_expansion')
    expect(NodeType.EXPANSION).toBe('expansion')
    expect(NodeType.COMMAND_SUBSTITUTION).toBe('command_substitution')
    expect(NodeType.ARITHMETIC_EXPANSION).toBe('arithmetic_expansion')
  })

  it('has shell operator tokens', () => {
    expect(NodeType.AND).toBe('&&')
    expect(NodeType.OR).toBe('||')
    expect(NodeType.PIPE).toBe('|')
    expect(NodeType.REDIRECT_OUT).toBe('>')
    expect(NodeType.REDIRECT_APPEND).toBe('>>')
  })

  it('is frozen at runtime', () => {
    expect(Object.isFrozen(NodeType)).toBe(true)
  })
})
