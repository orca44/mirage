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
import type { PathSpec } from '../../types.ts'
import type { MountRegistry } from '../mount/registry.ts'
import type { Session } from '../session/session.ts'
import { classifyWord } from './classify.ts'
import { expandNode, type ExecuteFn } from './node.ts'
import type { TSNodeLike } from './variable.ts'

const SPLIT_TYPES: ReadonlySet<string> = new Set([NT.SIMPLE_EXPANSION, NT.EXPANSION])

function hasAtExpansion(node: TSNodeLike): boolean {
  for (const child of node.children) {
    if (child.type === NT.SIMPLE_EXPANSION && child.text === '$@') return true
  }
  return false
}

function getPositionalArgs(session: Session, callStack: CallStack | null): string[] {
  if (callStack && callStack.getAllPositional().length > 0) {
    return callStack.getAllPositional()
  }
  return session.positionalArgs
}

export async function expandParts(
  parts: TSNodeLike[],
  session: Session,
  executeFn: ExecuteFn,
  callStack: CallStack | null = null,
): Promise<string[]> {
  const result: string[] = []
  for (const p of parts) {
    if (p.type === NT.STRING && hasAtExpansion(p)) {
      const positional = getPositionalArgs(session, callStack)
      if (positional.length > 0) {
        result.push(...positional)
        continue
      }
    }
    const expanded = await expandNode(p, session, executeFn, callStack)
    if (p.type === NT.COMMAND_SUBSTITUTION) {
      for (const word of expanded.split(/\s+/)) {
        if (word !== '') result.push(word)
      }
      continue
    }
    if (SPLIT_TYPES.has(p.type)) {
      for (const word of expanded.split(/\s+/)) {
        if (word !== '') result.push(word)
      }
    } else if (expanded !== '') {
      result.push(expanded)
    }
  }
  return result
}

export async function expandAndClassify(
  words: TSNodeLike[],
  session: Session,
  executeFn: ExecuteFn,
  registry: MountRegistry,
  cwd: string,
  callStack: CallStack | null = null,
): Promise<(string | PathSpec)[]> {
  const expanded = await expandParts(words, session, executeFn, callStack)
  return expanded.map((w) => classifyWord(w, registry, cwd))
}
