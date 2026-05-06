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

import type { CallStack } from '../../shell/call_stack.ts'
import { NodeType as NT } from '../../shell/types.ts'
import type { Session } from '../session/session.ts'

export interface TSNodeLike {
  type: string
  text: string
  children: TSNodeLike[]
  namedChildren: TSNodeLike[]
  isNamed?: boolean
}

export function lookupVar(name: string, session: Session, callStack: CallStack | null): string {
  const env = session.env
  const lastExitCode = session.lastExitCode
  const positional = session.positionalArgs
  if (name === '@' || name === '*') {
    if (callStack && callStack.getAllPositional().length > 0) {
      return callStack.getAllPositional().join(' ')
    }
    if (positional.length > 0) return positional.join(' ')
    return ''
  }
  if (name === '#') {
    if (callStack && callStack.getAllPositional().length > 0) {
      return String(callStack.getPositionalCount())
    }
    if (positional.length > 0) return String(positional.length)
    return '0'
  }
  if (name === '?') {
    return String(lastExitCode)
  }
  if (/^\d+$/.test(name)) {
    const idx = parseInt(name, 10)
    if (idx === 0) return 'mirage'
    if (callStack) {
      const fromCall = callStack.getPositional(idx)
      if (fromCall !== '') return fromCall
    }
    if (idx > 0 && idx <= positional.length) return positional[idx - 1] ?? ''
    return ''
  }
  if (callStack) {
    const localVal = callStack.getLocal(name)
    if (localVal !== null) return localVal
  }
  return env[name] ?? ''
}

export function expandBraces(
  node: TSNodeLike,
  env: Record<string, string>,
  callStack: CallStack | null,
): string {
  let varName: string | null = null
  let defaultVal: string | null = null
  for (const c of node.namedChildren) {
    if (c.type === NT.VARIABLE_NAME) {
      varName = c.text
    } else if (
      c.type === NT.WORD ||
      c.type === NT.STRING ||
      c.type === NT.RAW_STRING ||
      c.type === NT.STRING_CONTENT
    ) {
      defaultVal = c.text
    }
  }
  let val = ''
  if (varName !== null) {
    if (callStack) {
      const localVal = callStack.getLocal(varName)
      if (localVal !== null) val = localVal
    }
    if (val === '') val = env[varName] ?? ''
  }
  if (defaultVal !== null && val === '') return defaultVal
  return val
}
