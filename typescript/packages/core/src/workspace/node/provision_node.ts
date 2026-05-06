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

import {
  getCaseItems,
  getCommandName,
  getForParts,
  getIfBranches,
  getListParts,
  getNegatedCommand,
  getParts,
  getPipelineCommands,
  getRedirects,
  getSubshellBody,
  getText,
  getWhileParts,
} from '../../shell/helpers.ts'
import { NodeType as NT, ShellBuiltin as SB } from '../../shell/types.ts'
import { Precision, ProvisionResult } from '../../provision/types.ts'
import { rollupList } from '../../provision/rollup.ts'
import type { TSNodeLike } from '../expand/variable.ts'
import { classifyParts } from '../expand/classify.ts'
import { expandAndClassify, expandParts } from '../expand/parts.ts'
import type { ExecuteFn } from '../expand/node.ts'
import type { MountRegistry } from '../mount/registry.ts'
import { handleCommandProvision } from '../provision/command.ts'
import {
  handleForProvision,
  handleIfProvision,
  handleWhileProvision,
} from '../provision/control.ts'
import { handleConnectionProvision, handlePipeProvision } from '../provision/pipes.ts'
import { handleRedirectProvision } from '../provision/redirect.ts'
import type { Session } from '../session/session.ts'

const BUILTIN_NAMES: ReadonlySet<string> = new Set([
  SB.CD,
  SB.TRUE,
  SB.FALSE,
  SB.SOURCE,
  SB.DOT,
  SB.EVAL,
  SB.EXPORT,
  SB.UNSET,
  SB.LOCAL,
  SB.PRINTENV,
  SB.READ,
  SB.SET,
  SB.SHIFT,
  SB.TRAP,
  SB.TEST,
  SB.BRACKET,
  SB.DOUBLE_BRACKET,
  SB.WAIT,
  SB.FG,
  SB.KILL,
  SB.JOBS,
  SB.PS,
  SB.ECHO,
  SB.PRINTF,
  SB.SLEEP,
  SB.RETURN,
  SB.BREAK,
  SB.CONTINUE,
])

function handleBuiltinProvision(): ProvisionResult {
  return new ProvisionResult({ precision: Precision.EXACT })
}

interface ProvisionContext {
  registry: MountRegistry
  executeFn: ExecuteFn
}

export async function provisionNode(
  ctx: ProvisionContext,
  node: TSNodeLike | null | undefined,
  session: Session,
): Promise<ProvisionResult> {
  const recurse = (n: TSNodeLike, s: Session): Promise<ProvisionResult> => provisionNode(ctx, n, s)
  if (node === null || node === undefined) {
    return new ProvisionResult({ precision: Precision.EXACT })
  }
  const ntype = node.type

  if (ntype === NT.PROGRAM) {
    const children: ProvisionResult[] = []
    for (const c of node.namedChildren) children.push(await recurse(c, session))
    if (children.length === 0) return new ProvisionResult({ precision: Precision.EXACT })
    return rollupList(';', children)
  }

  if (ntype === NT.COMMAND) {
    const name = getCommandName(node)
    if (BUILTIN_NAMES.has(name)) return handleBuiltinProvision()
    const parts = getParts(node)
    const expanded = await expandParts(parts, session, ctx.executeFn)
    const classified = classifyParts(expanded, ctx.registry, session.cwd)
    return handleCommandProvision(ctx.registry, classified, session)
  }

  if (ntype === NT.PIPELINE) {
    const [commands] = getPipelineCommands(node)
    return handlePipeProvision(
      (n: unknown, s: Session) => recurse(n as TSNodeLike, s),
      commands,
      session,
    )
  }

  if (ntype === NT.LIST) {
    const [left, op, right] = getListParts(node)
    return handleConnectionProvision(
      (n: unknown, s: Session) => recurse(n as TSNodeLike, s),
      left,
      op ?? '&&',
      right,
      session,
    )
  }

  if (ntype === NT.REDIRECTED_STATEMENT) {
    const [command] = getRedirects(node)
    return handleRedirectProvision(
      (n: unknown, s: Session) => recurse(n as TSNodeLike, s),
      command,
      session,
    )
  }

  if (ntype === NT.SUBSHELL) {
    const body = getSubshellBody(node)
    const children: ProvisionResult[] = []
    for (const c of body) children.push(await recurse(c, session))
    if (children.length === 0) return new ProvisionResult({ precision: Precision.EXACT })
    return rollupList(';', children)
  }

  if (ntype === NT.IF_STATEMENT) {
    const [branches, elseBody] = getIfBranches(node)
    return handleIfProvision(
      (n: unknown, s: Session) => recurse(n as TSNodeLike, s),
      branches,
      elseBody,
      session,
    )
  }

  if (ntype === NT.FOR_STATEMENT) {
    const [, values, body] = getForParts(node)
    const classified = await expandAndClassify(
      values,
      session,
      ctx.executeFn,
      ctx.registry,
      session.cwd,
    )
    const n = classified.length || 1
    return handleForProvision(
      (nn: unknown, s: Session) => recurse(nn as TSNodeLike, s),
      body,
      n,
      session,
    )
  }

  if (ntype === NT.WHILE_STATEMENT) {
    const [, body] = getWhileParts(node)
    return handleWhileProvision(
      (n: unknown, s: Session) => recurse(n as TSNodeLike, s),
      body,
      session,
    )
  }

  if (ntype === NT.CASE_STATEMENT) {
    const items = getCaseItems(node)
    const children: ProvisionResult[] = []
    for (const [, body] of items) {
      if (body !== null) children.push(await recurse(body, session))
    }
    if (children.length > 0) return rollupList('||', children)
    return new ProvisionResult({ precision: Precision.EXACT })
  }

  if (
    ntype === NT.FUNCTION_DEFINITION ||
    ntype === NT.DECLARATION_COMMAND ||
    ntype === NT.UNSET_COMMAND ||
    ntype === NT.TEST_COMMAND ||
    ntype === NT.VARIABLE_ASSIGNMENT
  ) {
    return handleBuiltinProvision()
  }

  if (ntype === NT.NEGATED_COMMAND) {
    const inner = getNegatedCommand(node)
    return recurse(inner, session)
  }

  if (ntype === NT.COMPOUND_STATEMENT) {
    const children: ProvisionResult[] = []
    for (const c of node.namedChildren) children.push(await recurse(c, session))
    if (children.length === 0) return new ProvisionResult({ precision: Precision.EXACT })
    return rollupList(';', children)
  }

  return new ProvisionResult({ command: getText(node), precision: Precision.UNKNOWN })
}
