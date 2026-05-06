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
import type { TSNodeLike } from '../expand/variable.ts'
import type { ExecuteFn } from '../expand/node.ts'
import { expandNode } from '../expand/node.ts'
import type { Session } from '../session/session.ts'

async function expandInner(
  node: TSNodeLike,
  session: Session,
  executeFn: ExecuteFn,
  cs: CallStack | null,
): Promise<string[]> {
  const result: string[] = []
  if (node.type === NT.BINARY_EXPRESSION) {
    for (const part of node.children) {
      if (part.type === '=' || part.type === '!=' || part.type === '==') {
        result.push(part.text)
      } else if (part.isNamed === true) {
        result.push(await expandNode(part, session, executeFn, cs))
      }
    }
  } else if (node.type === NT.UNARY_EXPRESSION) {
    for (const part of node.children) {
      if (part.type === NT.TEST_OPERATOR) {
        result.push(part.text)
      } else if (part.isNamed === true) {
        result.push(await expandNode(part, session, executeFn, cs))
      }
    }
  } else {
    result.push(await expandNode(node, session, executeFn, cs))
  }
  return result
}

export async function expandTestExpr(
  node: TSNodeLike,
  session: Session,
  executeFn: ExecuteFn,
  cs: CallStack | null,
): Promise<string[]> {
  const result: string[] = []
  for (const child of node.namedChildren) {
    if (child.type === NT.BINARY_EXPRESSION) {
      for (const part of child.children) {
        if (part.type === '=' || part.type === '!=' || part.type === '==') {
          result.push(part.text)
        } else if (part.isNamed === true) {
          result.push(await expandNode(part, session, executeFn, cs))
        }
      }
    } else if (child.type === NT.UNARY_EXPRESSION) {
      for (const part of child.children) {
        if (part.type === NT.TEST_OPERATOR) {
          result.push(part.text)
        } else if (part.isNamed === true) {
          result.push(await expandNode(part, session, executeFn, cs))
        }
      }
    } else if (child.type === NT.NEGATION_EXPRESSION) {
      result.push('!')
      for (const part of child.namedChildren) {
        result.push(...(await expandInner(part, session, executeFn, cs)))
      }
    } else {
      result.push(await expandNode(child, session, executeFn, cs))
    }
  }
  return result
}
