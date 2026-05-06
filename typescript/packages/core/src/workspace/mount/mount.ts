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

import { type Accessor, NOOPAccessor } from '../../accessor/base.ts'
import type {
  CommandDispatch,
  CommandFn,
  CommandHistory,
  CommandOpts,
  RegisteredCommand,
} from '../../commands/config.ts'
import type { OpKwargs } from '../../ops/registry.ts'

const NOOP_ACCESSOR = new NOOPAccessor()
import { getExtension } from '../../commands/resolve.ts'
import type { CommandSpec } from '../../commands/spec/types.ts'
import type { ByteSource } from '../../io/types.ts'
import { IOResult } from '../../io/types.ts'
import { setVirtualPrefix } from '../../observe/context.ts'
import type { RegisteredOp } from '../../ops/registry.ts'
import type { Resource } from '../../resource/base.ts'
import { ConsistencyPolicy, MountMode, PathSpec } from '../../types.ts'

type CmdKey = string
type OpKey = string

function cmdKey(name: string, filetype: string | null): CmdKey {
  return `${name}\u0000${filetype ?? ''}`
}

function isRegisteredOp(item: RegisteredCommand | RegisteredOp): item is RegisteredOp {
  return typeof (item as RegisteredOp).fn === 'function' && !('spec' in item)
}

function opKey(name: string, filetype: string | null): OpKey {
  return `${name}\u0000${filetype ?? ''}`
}

function crossKey(name: string, targetResource: string): string {
  return `${name}\u0000${targetResource}`
}

export interface MountInit {
  prefix: string
  resource: Resource
  mode?: MountMode
  consistency?: ConsistencyPolicy
}

export class Mount {
  readonly prefix: string
  readonly resource: Resource
  readonly mode: MountMode
  readonly consistency: ConsistencyPolicy

  private readonly cmds = new Map<CmdKey, RegisteredCommand>()
  private readonly generalCmds = new Map<string, RegisteredCommand>()
  private readonly cmdSpecs = new Map<string, CommandSpec>()
  private readonly ops = new Map<OpKey, RegisteredOp>()
  private readonly generalOps = new Map<string, RegisteredOp>()
  private readonly crossCmds = new Map<string, RegisteredCommand>()

  constructor(init: MountInit) {
    const prefix = init.prefix
    if (!prefix.startsWith('/')) {
      throw new Error(`prefix must start with /: ${prefix}`)
    }
    if (!prefix.endsWith('/')) {
      throw new Error(`prefix must end with /: ${prefix}`)
    }
    if (prefix.includes('//')) {
      throw new Error(`prefix must not contain //: ${prefix}`)
    }
    this.prefix = prefix
    this.resource = init.resource
    this.mode = init.mode ?? MountMode.READ
    this.consistency = init.consistency ?? ConsistencyPolicy.LAZY
  }

  // ── command registration ──────────────────────────

  register(cmd: RegisteredCommand): void {
    this.cmds.set(cmdKey(cmd.name, cmd.filetype), cmd)
    this.cmdSpecs.set(cmd.name, cmd.spec)
  }

  registerGeneral(cmd: RegisteredCommand): void {
    this.generalCmds.set(cmd.name, cmd)
    this.cmdSpecs.set(cmd.name, cmd.spec)
  }

  resolveCommand(cmdName: string, extension: string | null = null): RegisteredCommand | null {
    if (extension !== null && extension !== '') {
      const specific = this.cmds.get(cmdKey(cmdName, extension))
      if (specific !== undefined) return specific
    }
    const byResource = this.cmds.get(cmdKey(cmdName, null))
    if (byResource !== undefined) return byResource
    const general = this.generalCmds.get(cmdName)
    if (general !== undefined) return general
    // Fall back to any filetype variant so callers without an extension can
    // still find the command; the actual handler is picked by executeCmd.
    for (const rc of this.cmds.values()) {
      if (rc.name === cmdName) return rc
    }
    return null
  }

  isGeneralCommand(cmdName: string): boolean {
    return this.generalCmds.has(cmdName)
  }

  allCommands(): readonly RegisteredCommand[] {
    const seen = new Set<string>()
    const out: RegisteredCommand[] = []
    for (const rc of this.cmds.values()) {
      if (seen.has(rc.name)) continue
      seen.add(rc.name)
      out.push(rc)
    }
    for (const rc of this.generalCmds.values()) {
      if (seen.has(rc.name)) continue
      seen.add(rc.name)
      out.push(rc)
    }
    return out
  }

  specFor(cmdName: string): CommandSpec | null {
    return this.cmdSpecs.get(cmdName) ?? null
  }

  filetypeHandlers(cmdName: string): Record<string, CommandFn> {
    const fns: Record<string, CommandFn> = {}
    for (const [key, rc] of this.cmds) {
      if (rc.name === cmdName && rc.filetype !== null) {
        if (!(rc.filetype in fns)) fns[rc.filetype] = rc.fn
      }
      void key
    }
    return fns
  }

  unregister(names: string[]): void {
    for (const name of names) {
      for (const [key, rc] of this.cmds) {
        if (rc.name === name) this.cmds.delete(key)
      }
      this.generalCmds.delete(name)
      this.cmdSpecs.delete(name)
      for (const [key, ro] of this.ops) {
        if (ro.name === name) this.ops.delete(key)
      }
      this.generalOps.delete(name)
    }
  }

  commands(): Record<string, (string | null)[]> {
    const result = new Map<string, (string | null)[]>()
    for (const rc of this.cmds.values()) {
      const list = result.get(rc.name) ?? []
      list.push(rc.filetype)
      result.set(rc.name, list)
    }
    for (const name of this.generalCmds.keys()) {
      if (!result.has(name)) result.set(name, [])
    }
    return sortFiletypeMap(result)
  }

  registeredOps(): Record<string, (string | null)[]> {
    const result = new Map<string, (string | null)[]>()
    for (const ro of this.ops.values()) {
      const list = result.get(ro.name) ?? []
      list.push(ro.filetype)
      result.set(ro.name, list)
    }
    for (const name of this.generalOps.keys()) {
      if (!result.has(name)) result.set(name, [])
    }
    return sortFiletypeMap(result)
  }

  // ── cross-mount registration ─────────────────────

  registerCross(cmd: RegisteredCommand, targetResourceType: string): void {
    this.crossCmds.set(crossKey(cmd.name, targetResourceType), cmd)
  }

  resolveCross(cmdName: string, targetResourceType: string): RegisteredCommand | null {
    return this.crossCmds.get(crossKey(cmdName, targetResourceType)) ?? null
  }

  // ── op registration ───────────────────────────────

  registerOp(op: RegisteredOp): void {
    this.ops.set(opKey(op.name, op.filetype), op)
  }

  registerGeneralOp(op: RegisteredOp): void {
    this.generalOps.set(op.name, op)
  }

  /**
   * Batch-register commands and ops. Mirrors Python's
   * `Mount.register_fns(...)`. Each entry is a `RegisteredCommand` or
   * `RegisteredOp`; commands with `resource: null` go to the general
   * table, ops with `resource: null` likewise. Resource-specific
   * entries must match this mount's resource kind.
   */
  registerFns(items: readonly (RegisteredCommand | RegisteredOp)[]): void {
    const kind = this.resource.kind
    for (const item of items) {
      if (isRegisteredOp(item)) {
        if (item.resource !== null && item.resource !== kind) {
          throw new Error(`op ${item.name} is for resource ${item.resource}, not ${kind}`)
        }
        if (item.resource === null) this.registerGeneralOp(item)
        else this.registerOp(item)
        continue
      }
      if (item.resource !== null && item.resource !== kind) {
        throw new Error(`command ${item.name} is for resource ${item.resource}, not ${kind}`)
      }
      if (item.resource === null) this.registerGeneral(item)
      else this.register(item)
    }
  }

  private resolveCascade<T>(
    name: string,
    extension: string | null,
    table: Map<string, T>,
    general: Map<string, T>,
  ): T[] {
    const levels: T[] = []
    if (extension !== null && extension !== '') {
      const specific = table.get(cmdKey(name, extension))
      if (specific !== undefined) levels.push(specific)
    }
    const byResource = table.get(cmdKey(name, null))
    if (byResource !== undefined) levels.push(byResource)
    const generalEntry = general.get(name)
    if (generalEntry !== undefined) levels.push(generalEntry)
    return levels
  }

  // ── execution ─────────────────────────────────────

  async executeCmd(
    cmdName: string,
    paths: PathSpec[],
    texts: string[],
    flags: Record<string, string | boolean>,
    opts: {
      stdin?: ByteSource | null
      cwd?: string
      dispatch?: CommandDispatch
      history?: CommandHistory
      sessionId?: string
    } = {},
  ): Promise<[ByteSource | null, IOResult]> {
    const extension =
      paths.length > 0 && paths[0] !== undefined ? getExtension(paths[0].original) : null

    const handlers = this.resolveCascade(cmdName, extension, this.cmds, this.generalCmds)
    if (handlers.length === 0) {
      return [
        null,
        new IOResult({
          exitCode: 127,
          stderr: new TextEncoder().encode(`${cmdName}: command not found`),
        }),
      ]
    }

    const mountPrefix = this.prefix.replace(/\/+$/, '')
    const filetypeFns = this.filetypeHandlers(cmdName)
    const isFiletypeCmd =
      extension !== null && extension !== '' && this.cmds.has(cmdKey(cmdName, extension))

    const prefixedPaths = paths.map(
      (p) =>
        new PathSpec({
          original: p.original,
          directory: p.directory,
          pattern: p.pattern,
          resolved: p.resolved,
          prefix: mountPrefix,
        }),
    )

    const expandedPaths =
      this.resource.glob !== undefined ? await this.resource.glob(prefixedPaths) : prefixedPaths

    const accessor = (this.resource as { accessor?: Accessor }).accessor ?? NOOP_ACCESSOR
    const cmdOpts: CommandOpts = {
      stdin: opts.stdin ?? null,
      flags,
      filetypeFns: isFiletypeCmd ? null : filetypeFns,
      mountPrefix,
      cwd: opts.cwd ?? '/',
      resource: this.resource,
      ...(this.resource.index !== undefined ? { index: this.resource.index } : {}),
      ...(opts.dispatch !== undefined ? { dispatch: opts.dispatch } : {}),
      ...(opts.history !== undefined ? { history: opts.history } : {}),
      ...(opts.sessionId !== undefined ? { sessionId: opts.sessionId } : {}),
    }

    setVirtualPrefix(mountPrefix)
    try {
      for (const cmd of handlers) {
        if (cmd.write && this.mode === MountMode.READ) {
          return [
            null,
            new IOResult({
              exitCode: 1,
              stderr: new TextEncoder().encode(`${cmdName}: read-only mount at ${this.prefix}`),
            }),
          ]
        }
        const result = await cmd.fn(accessor, expandedPaths, texts, cmdOpts)
        if (result !== null) {
          return result
        }
      }
      return [null, new IOResult()]
    } finally {
      setVirtualPrefix('')
    }
  }

  async executeOp(
    opName: string,
    path: string,
    args: readonly unknown[] = [],
    kwargs: OpKwargs = {},
  ): Promise<unknown> {
    const filetype = getExtension(path)
    const levels = this.resolveCascade(opName, filetype, this.ops, this.generalOps)
    if (levels.length === 0) {
      throw new Error(`${this.resource.kind}: no op ${opName}`)
    }
    if (this.mode === MountMode.READ && levels.some((o) => o.write)) {
      throw new Error(`mount ${this.prefix} is read-only`)
    }
    const mountPrefix = this.prefix.replace(/\/+$/, '')
    const lastSlash = path.lastIndexOf('/')
    const scope = new PathSpec({
      original: path,
      directory: lastSlash > 0 ? path.slice(0, lastSlash + 1) : '/',
      prefix: mountPrefix,
    })
    const effectiveKwargs: OpKwargs = {
      ...kwargs,
      ...(kwargs.index === undefined && this.resource.index !== undefined
        ? { index: this.resource.index }
        : {}),
      ...(filetype !== null && kwargs.filetype === undefined ? { filetype } : {}),
    }
    const accessor = this.resource.accessor ?? NOOP_ACCESSOR
    for (const op of levels) {
      const result = await op.fn(accessor, scope, args, effectiveKwargs)
      if (result !== null && result !== undefined) return result
    }
    return null
  }
}

function sortFiletypeMap(m: Map<string, (string | null)[]>): Record<string, (string | null)[]> {
  const out: Record<string, (string | null)[]> = {}
  for (const k of [...m.keys()].sort()) {
    const list = m.get(k) ?? []
    list.sort((a, b) => {
      const aKey = a === null ? 0 : 1
      const bKey = b === null ? 0 : 1
      if (aKey !== bKey) return aKey - bKey
      return (a ?? '').localeCompare(b ?? '')
    })
    out[k] = list
  }
  return out
}
