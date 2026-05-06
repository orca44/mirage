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

import { interpretEscapes } from '../../commands/builtin/utils/escapes.ts'
import type { RegisteredCommand } from '../../commands/config.ts'
import { BUILTIN_SPECS } from '../../commands/spec/builtins.ts'
import { resolvePath } from '../../commands/spec/parser.ts'
import type { CommandSpec } from '../../commands/spec/types.ts'
import { AsyncLineIterator } from '../../io/async_line_iterator.ts'
import { asyncChain } from '../../io/stream.ts'
import type { IOResult as IOResultType } from '../../io/types.ts'
import { IOResult, materialize } from '../../io/types.ts'
import type { ByteSource } from '../../io/types.ts'
import type { CallStack } from '../../shell/call_stack.ts'
import { FileType, PathSpec } from '../../types.ts'
import type { Mount } from '../mount/mount.ts'
import { DEV_PREFIX, type MountRegistry } from '../mount/registry.ts'
import type { Session } from '../session/session.ts'
import { ExecutionNode } from '../types.ts'
import type { DispatchFn } from './cross_mount.ts'
import { ReturnSignal } from './command.ts'

type Result = [ByteSource | null, IOResult, ExecutionNode]

export type ExecuteStringFn = (script: string, opts: { sessionId: string }) => Promise<IOResultType>

function toScope(path: string): PathSpec {
  const lastSlash = path.lastIndexOf('/')
  const directory = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : '/'
  return new PathSpec({ original: path, directory, resolved: true })
}

function scopePath(val: string | PathSpec): string {
  return val instanceof PathSpec ? val.original : val
}

export async function handleCd(
  dispatch: DispatchFn,
  isMountRoot: (path: string) => boolean,
  path: string | PathSpec,
  session: Session,
): Promise<Result> {
  const raw = scopePath(path)
  const resolved = resolvePath(session.cwd, raw)
  if (resolved === '/') {
    session.cwd = '/'
    return [null, new IOResult(), new ExecutionNode({ command: `cd ${raw}`, exitCode: 0 })]
  }
  const scope = toScope(resolved)
  let stat: { type?: string } | null = null
  let notFound = false
  try {
    const [s] = await dispatch('stat', scope)
    stat = s as { type?: string } | null
  } catch (exc) {
    const msg = exc instanceof Error ? exc.message : String(exc)
    if (/not found|no such file/i.test(msg)) {
      notFound = true
    } else {
      const err = new TextEncoder().encode(`cd: ${raw}: ${msg}\n`)
      return [
        null,
        new IOResult({ exitCode: 1, stderr: err }),
        new ExecutionNode({ command: `cd ${raw}`, exitCode: 1, stderr: err }),
      ]
    }
  }
  if (stat === null || notFound) {
    if (!isMountRoot(resolved)) {
      const err = new TextEncoder().encode(`cd: ${raw}: No such file or directory\n`)
      return [
        null,
        new IOResult({ exitCode: 1, stderr: err }),
        new ExecutionNode({ command: `cd ${raw}`, exitCode: 1, stderr: err }),
      ]
    }
  } else if (stat.type !== FileType.DIRECTORY) {
    const err = new TextEncoder().encode(`cd: ${raw}: Not a directory\n`)
    return [
      null,
      new IOResult({ exitCode: 1, stderr: err }),
      new ExecutionNode({ command: `cd ${raw}`, exitCode: 1, stderr: err }),
    ]
  }
  session.cwd = resolved
  return [null, new IOResult(), new ExecutionNode({ command: `cd ${raw}`, exitCode: 0 })]
}

export function handleExport(assignments: string[], session: Session): Result {
  for (const assign of assignments) {
    const eq = assign.indexOf('=')
    if (eq >= 0) {
      const key = assign.slice(0, eq)
      session.env[key] = assign.slice(eq + 1)
    } else if (!(assign in session.env)) {
      session.env[assign] = ''
    }
  }
  return [null, new IOResult(), new ExecutionNode({ command: 'export', exitCode: 0 })]
}

export function handleUnset(names: string[], session: Session): Result {
  for (const name of names) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete session.env[name]
  }
  return [null, new IOResult(), new ExecutionNode({ command: 'unset', exitCode: 0 })]
}

export function handlePrintenv(name: string | null, session: Session): Result {
  if (name !== null) {
    const val = session.env[name]
    if (val === undefined) {
      return [
        null,
        new IOResult({ exitCode: 1 }),
        new ExecutionNode({ command: 'printenv', exitCode: 1 }),
      ]
    }
    const out = new TextEncoder().encode(`${val}\n`)
    return [out, new IOResult(), new ExecutionNode({ command: 'printenv', exitCode: 0 })]
  }
  const lines = Object.entries(session.env).map(([k, v]) => `${k}=${v}`)
  lines.sort()
  const out = new TextEncoder().encode(`${lines.join('\n')}\n`)
  return [out, new IOResult(), new ExecutionNode({ command: 'printenv', exitCode: 0 })]
}

export function handleWhoami(session: Session): Result {
  const user = session.env.USER
  if (user === undefined) {
    const err = new TextEncoder().encode('whoami: USER not set\n')
    return [
      null,
      new IOResult({ exitCode: 1, stderr: err }),
      new ExecutionNode({ command: 'whoami', exitCode: 1, stderr: err }),
    ]
  }
  const out = new TextEncoder().encode(`${user}\n`)
  return [out, new IOResult(), new ExecutionNode({ command: 'whoami', exitCode: 0 })]
}

interface ManHit {
  mount: Mount
  cmd: RegisteredCommand
  isGeneral: boolean
}

function collectManHits(name: string, registry: MountRegistry): ManHit[] {
  const hits: ManHit[] = []
  for (const mount of registry.allMounts()) {
    if (mount.prefix === DEV_PREFIX) continue
    const cmd = mount.resolveCommand(name)
    if (cmd === null) continue
    hits.push({ mount, cmd, isGeneral: mount.isGeneralCommand(name) })
  }
  return hits
}

function renderOptionsTable(spec: {
  options: readonly {
    short?: string | null
    long?: string | null
    valueKind: string
    description?: string | null
  }[]
}): string[] {
  if (spec.options.length === 0) return []
  const lines: string[] = []
  lines.push('## OPTIONS', '')
  lines.push('| short | long | value | description |')
  lines.push('| ----- | ---- | ----- | ----------- |')
  for (const opt of spec.options) {
    const short = opt.short ?? ''
    const long = opt.long ?? ''
    lines.push(`| ${short} | ${long} | ${opt.valueKind} | ${opt.description ?? ''} |`)
  }
  lines.push('')
  return lines
}

function renderManEntry(name: string, hits: ManHit[]): string {
  const first = hits[0]
  if (first === undefined) return ''
  const spec = first.cmd.spec
  const lines: string[] = []
  lines.push(`# ${name}`, '')
  lines.push(spec.description ?? '(no description)', '')
  lines.push(...renderOptionsTable(spec))
  lines.push('## RESOURCES', '')
  const seen = new Set<string>()
  let hasGeneral = false
  const rows: string[] = []
  for (const h of hits) {
    if (h.isGeneral) {
      hasGeneral = true
      continue
    }
    const kind = h.mount.resource.kind
    const filetype = h.cmd.filetype
    const key = `${kind}\u0000${filetype ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(filetype !== null ? `- ${kind} (filetype: ${filetype})` : `- ${kind}`)
  }
  rows.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  if (hasGeneral) lines.push('- general')
  for (const r of rows) lines.push(r)
  return lines.join('\n') + '\n'
}

function renderManIndex(session: Session, registry: MountRegistry): string {
  const byKind = new Map<string, Mount>()
  for (const m of registry.allMounts()) {
    if (m.prefix === DEV_PREFIX) continue
    if (!byKind.has(m.resource.kind)) byKind.set(m.resource.kind, m)
  }
  const cwdMount = registry.mountFor(session.cwd)
  const cwdKind =
    cwdMount !== null && cwdMount.prefix !== DEV_PREFIX ? cwdMount.resource.kind : null

  const kinds = [...byKind.keys()].sort()
  const ordered: string[] = []
  if (cwdKind !== null && byKind.has(cwdKind)) ordered.push(cwdKind)
  for (const k of kinds) {
    if (k === cwdKind) continue
    ordered.push(k)
  }

  const lines: string[] = []
  const generalSeen = new Map<string, RegisteredCommand>()
  for (const kind of ordered) {
    const m = byKind.get(kind)
    if (m === undefined) continue
    lines.push(`# ${kind}`, '')
    const allCmds = m.allCommands()
    const resourceCmds = allCmds
      .filter((c) => !m.isGeneralCommand(c.name))
      .slice()
      .sort((a, b) => (a.name < b.name ? -1 : 1))
    for (const cmd of resourceCmds) {
      lines.push(`- ${cmd.name} — ${cmd.spec.description ?? '(no description)'}`)
    }
    for (const cmd of allCmds) {
      if (m.isGeneralCommand(cmd.name) && !generalSeen.has(cmd.name)) {
        generalSeen.set(cmd.name, cmd)
      }
    }
    lines.push('')
  }
  lines.push('# general', '')
  for (const [name, cmd] of [...generalSeen.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    lines.push(`- ${name} — ${cmd.spec.description ?? '(no description)'}`)
  }
  return lines.join('\n') + '\n'
}

const SHELL_BUILTIN_MAN: Readonly<Record<string, string>> = Object.freeze({
  bash: 'bash',
  sh: 'bash',
})

function renderShellBuiltinMan(
  name: string,
  spec: { description: string | null; options: CommandSpec['options'] },
): string {
  const lines: string[] = []
  lines.push(`# ${name}`, '')
  lines.push(spec.description ?? '(no description)', '')
  lines.push(...renderOptionsTable(spec))
  lines.push('## RESOURCES', '')
  lines.push('- shell builtin')
  return lines.join('\n') + '\n'
}

export function handleMan(args: string[], session: Session, registry: MountRegistry): Result {
  const name = args[0]
  if (name === undefined) {
    const out = new TextEncoder().encode(renderManIndex(session, registry))
    return [out, new IOResult(), new ExecutionNode({ command: 'man', exitCode: 0 })]
  }
  const hits = collectManHits(name, registry)
  if (hits.length === 0) {
    const specKey = SHELL_BUILTIN_MAN[name]
    const spec = specKey !== undefined ? BUILTIN_SPECS[specKey] : undefined
    if (spec !== undefined) {
      const out = new TextEncoder().encode(renderShellBuiltinMan(name, spec))
      return [out, new IOResult(), new ExecutionNode({ command: `man ${name}`, exitCode: 0 })]
    }
    const err = new TextEncoder().encode(`man: no entry for ${name}\n`)
    return [
      null,
      new IOResult({ exitCode: 1, stderr: err }),
      new ExecutionNode({ command: `man ${name}`, exitCode: 1, stderr: err }),
    ]
  }
  const out = new TextEncoder().encode(renderManEntry(name, hits))
  return [out, new IOResult(), new ExecutionNode({ command: `man ${name}`, exitCode: 0 })]
}

export async function handleEval(
  executeFn: ExecuteStringFn,
  args: string[],
  session: Session,
): Promise<Result> {
  const script = args.join(' ')
  const io = await executeFn(script, { sessionId: session.sessionId })
  return [io.stdout, io, new ExecutionNode({ command: 'eval', exitCode: io.exitCode })]
}

const BASH_NOOP_SHORT_FLAGS = new Set(['l', 'i', 'e', 'u', 'x'])
const BASH_NOOP_LONG_FLAGS = new Set(['--login', '--norc', '--noprofile', '--posix', '--rcfile'])

function bashCError(): Result {
  const err = new TextEncoder().encode('bash: -c: option requires an argument\n')
  return [
    null,
    new IOResult({ exitCode: 2, stderr: err }),
    new ExecutionNode({ command: 'bash', exitCode: 2, stderr: err }),
  ]
}

export async function handleBash(
  executeFn: ExecuteStringFn,
  args: string[],
  session: Session,
  stdin: ByteSource | null = null,
): Promise<Result> {
  let script: string | null = null
  let readStdin = false
  let i = 0
  while (i < args.length) {
    const tok = args[i] ?? ''
    if (tok === '--') {
      i += 1
      break
    }
    if (tok === '-c') {
      const next = args[i + 1]
      if (next === undefined) return bashCError()
      script = next
      break
    }
    if (tok === '-s') {
      readStdin = true
      i += 1
      continue
    }
    if (tok === '-o' || tok === '+o') {
      i += 2
      continue
    }
    if (BASH_NOOP_LONG_FLAGS.has(tok)) {
      i += 1
      continue
    }
    if (tok.startsWith('-') && tok.length > 1 && !tok.startsWith('--')) {
      const chars = tok.slice(1)
      if (chars.includes('c')) {
        const next = args[i + 1]
        if (next === undefined) return bashCError()
        script = next
        break
      }
      let allNoop = true
      for (let j = 0; j < chars.length; j++) {
        const ch = chars.charAt(j)
        if (!BASH_NOOP_SHORT_FLAGS.has(ch) && ch !== 's') {
          allNoop = false
          break
        }
      }
      if (allNoop) {
        if (chars.includes('s')) readStdin = true
        i += 1
        continue
      }
      const err = new TextEncoder().encode(`bash: ${tok}: unsupported option\n`)
      return [
        null,
        new IOResult({ exitCode: 2, stderr: err }),
        new ExecutionNode({ command: 'bash', exitCode: 2, stderr: err }),
      ]
    }
    script = tok
    break
  }
  if (script === null && readStdin && stdin !== null) {
    const data = await materialize(stdin)
    if (data.length > 0) {
      script = new TextDecoder().decode(data)
    }
  }
  if (script === null) {
    return [null, new IOResult(), new ExecutionNode({ command: 'bash', exitCode: 0 })]
  }
  const io = await executeFn(script, { sessionId: session.sessionId })
  return [io.stdout, io, new ExecutionNode({ command: `bash -c ${script}`, exitCode: io.exitCode })]
}

async function evalTest(dispatch: DispatchFn, argv: (string | PathSpec)[]): Promise<boolean> {
  if (argv.length === 0) return false
  const firstArg = argv[0]
  if (firstArg === undefined) return false
  const first = scopePath(firstArg)
  if (first === '!' && argv.length > 1) {
    return !(await evalTest(dispatch, argv.slice(1)))
  }
  if (argv.length === 1) return Boolean(first)
  if (argv.length === 2) {
    const op = scopePath(firstArg)
    const val = argv[1]
    if (val === undefined) return false
    if (op === '-z') return scopePath(val) === ''
    if (op === '-n') return scopePath(val) !== ''
    if (op === '-f') {
      const scope = val instanceof PathSpec ? val : toScope(scopePath(val))
      try {
        await dispatch('stat', scope)
        return true
      } catch {
        return false
      }
    }
    if (op === '-d') {
      const scope =
        val instanceof PathSpec
          ? val
          : new PathSpec({
              original: scopePath(val),
              directory: scopePath(val),
              resolved: false,
            })
      try {
        await dispatch('readdir', scope)
        return true
      } catch {
        return false
      }
    }
  }
  if (argv.length === 3) {
    const leftArg = argv[0]
    const opArg = argv[1]
    const rightArg = argv[2]
    if (leftArg === undefined || opArg === undefined || rightArg === undefined) return false
    const left = scopePath(leftArg)
    const op = scopePath(opArg)
    const right = scopePath(rightArg)
    if (op === '=' || op === '==') return left === right
    if (op === '!=') return left !== right
    const li = Number(left)
    const ri = Number(right)
    if (!Number.isInteger(li) || !Number.isInteger(ri)) return false
    if (op === '-eq') return li === ri
    if (op === '-ne') return li !== ri
    if (op === '-lt') return li < ri
    if (op === '-le') return li <= ri
    if (op === '-gt') return li > ri
    if (op === '-ge') return li >= ri
  }
  return false
}

export async function handleTest(
  dispatch: DispatchFn,
  argv: (string | PathSpec)[],
  _session: Session,
): Promise<Result> {
  const result = await evalTest(dispatch, argv)
  const code = result ? 0 : 1
  return [
    null,
    new IOResult({ exitCode: code }),
    new ExecutionNode({ command: 'test', exitCode: code }),
  ]
}

export function handleLocal(assignments: string[], session: Session): Result {
  const locals = session.localVars
  for (const assign of assignments) {
    const eq = assign.indexOf('=')
    if (eq >= 0) {
      const key = assign.slice(0, eq)
      if (locals !== null && !locals.has(key)) {
        locals.set(key, key in session.env ? (session.env[key] ?? null) : null)
      }
      session.env[key] = assign.slice(eq + 1)
    } else {
      if (locals !== null && !locals.has(assign)) {
        locals.set(assign, assign in session.env ? (session.env[assign] ?? null) : null)
      }
      if (!(assign in session.env)) session.env[assign] = ''
    }
  }
  return [null, new IOResult(), new ExecutionNode({ command: 'local', exitCode: 0 })]
}

export function handleShift(
  n: number,
  callStack: CallStack | null,
  session: Session | null = null,
): Result {
  let shifted = false
  if (callStack !== null && callStack.getAllPositional().length > 0) {
    callStack.shift(n)
    shifted = true
  }
  if (!shifted && session !== null) {
    session.positionalArgs = session.positionalArgs.slice(n)
  }
  return [null, new IOResult(), new ExecutionNode({ command: 'shift', exitCode: 0 })]
}

export function handleSet(
  args: string[],
  session: Session,
  _callStack: CallStack | null = null,
): Result {
  if (args.length === 0) {
    const lines = Object.entries(session.env).map(([k, v]) => `${k}=${v}`)
    lines.sort()
    const out = new TextEncoder().encode(`${lines.join('\n')}\n`)
    return [out, new IOResult(), new ExecutionNode({ command: 'set', exitCode: 0 })]
  }
  if (args[0] === '--') {
    session.positionalArgs = args.slice(1)
  }
  return [null, new IOResult(), new ExecutionNode({ command: 'set', exitCode: 0 })]
}

export function handleTrap(_session: Session): Result {
  return [null, new IOResult(), new ExecutionNode({ command: 'trap', exitCode: 0 })]
}

export function handleReturn(exitCode: number): Result {
  throw new ReturnSignal(exitCode)
}

export function handleEcho(args: string[], nFlag = false, eFlag = false): Result {
  let text = args.join(' ')
  if (eFlag) text = interpretEscapes(text)
  if (!nFlag) text += '\n'
  const out = new TextEncoder().encode(text)
  return [out, new IOResult(), new ExecutionNode({ command: 'echo', exitCode: 0 })]
}

export function handlePrintf(args: string[]): Result {
  if (args.length === 0) {
    return [new Uint8Array(), new IOResult(), new ExecutionNode({ command: 'printf', exitCode: 0 })]
  }
  let fmt = args[0] ?? ''
  fmt = fmt.replaceAll('\\n', '\n').replaceAll('\\t', '\t')
  let result = fmt
  if (args.length > 1) {
    try {
      result = applyPrintf(fmt, args.slice(1))
    } catch {
      result = fmt
    }
  }
  const out = new TextEncoder().encode(result)
  return [out, new IOResult(), new ExecutionNode({ command: 'printf', exitCode: 0 })]
}

function applyPrintf(fmt: string, values: string[]): string {
  let argIdx = 0
  return fmt.replace(/%[sd]/g, (match) => {
    const v = values[argIdx++] ?? ''
    if (match === '%s') return v
    const n = Number(v)
    return Number.isFinite(n) ? String(Math.trunc(n)) : v
  })
}

/**
 * `read VAR1 [VAR2 ...]` — read one line from stdin and assign to env vars.
 * Mirrors Python's `mirage.workspace.executor.builtins.handle_read`.
 *
 * Mirrors POSIX behavior:
 *   - Single var: assign whole line.
 *   - Multiple vars: split on whitespace, last var gets the remainder.
 *   - No stdin / EOF: assign all vars to "" and exit 1.
 */
export async function handleRead(
  variables: string[],
  session: Session,
  stdin: ByteSource | null,
): Promise<Result> {
  if (session.stdinBuffer === null && stdin !== null) {
    if (stdin instanceof Uint8Array) {
      session.stdinBuffer = new AsyncLineIterator(asyncChain(stdin))
    } else {
      session.stdinBuffer = new AsyncLineIterator(stdin)
    }
  }
  let lineBytes: Uint8Array | null = null
  if (session.stdinBuffer !== null) {
    lineBytes = await session.stdinBuffer.readline()
  }
  if (lineBytes === null) {
    for (const v of variables) {
      session.env[v] = ''
    }
    return [
      null,
      new IOResult({ exitCode: 1 }),
      new ExecutionNode({ command: 'read', exitCode: 1 }),
    ]
  }
  const line = new TextDecoder().decode(lineBytes)
  if (variables.length <= 1) {
    if (variables.length === 1) {
      const v = variables[0]
      if (v !== undefined) session.env[v] = line
    }
  } else {
    const parts = line.split(/\s+/).filter((p) => p !== '')
    for (let i = 0; i < variables.length; i++) {
      const name = variables[i]
      if (name === undefined) continue
      if (i === variables.length - 1) {
        session.env[name] = parts.slice(i).join(' ')
      } else {
        session.env[name] = parts[i] ?? ''
      }
    }
  }
  return [null, new IOResult(), new ExecutionNode({ command: 'read', exitCode: 0 })]
}

/**
 * `source FILE` / `. FILE` — read a script file and execute it.
 * Mirrors Python's `mirage.workspace.executor.builtins.handle_source`.
 */
export async function handleSource(
  dispatch: DispatchFn,
  executeFn: ExecuteStringFn,
  path: string | PathSpec,
  session: Session,
): Promise<Result> {
  const raw = scopePath(path)
  const resolved = resolvePath(raw, session.cwd)
  const scope = toScope(resolved)
  let script = ''
  try {
    const [data] = await dispatch('read', scope)
    if (data instanceof Uint8Array) {
      script = new TextDecoder().decode(data)
    } else if (data !== null && data !== undefined) {
      // ByteSource: collect into a string
      const chunks: number[] = []
      for await (const chunk of data as AsyncIterable<Uint8Array>) {
        for (const b of chunk) chunks.push(b)
      }
      script = new TextDecoder().decode(new Uint8Array(chunks))
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      null,
      new IOResult({
        exitCode: 1,
        stderr: new TextEncoder().encode(`source: ${raw}: ${msg}\n`),
      }),
      new ExecutionNode({ command: `source ${raw}`, exitCode: 1 }),
    ]
  }
  const io = await executeFn(script, { sessionId: session.sessionId })
  return [io.stdout, io, new ExecutionNode({ command: `source ${raw}`, exitCode: io.exitCode })]
}

export async function handleSleep(args: string[]): Promise<Result> {
  const raw = args[0]
  if (raw === undefined) {
    return [null, new IOResult(), new ExecutionNode({ command: 'sleep', exitCode: 0 })]
  }
  const seconds = Number(raw)
  if (!Number.isFinite(seconds)) {
    const err = new TextEncoder().encode(`sleep: invalid argument: ${raw}\n`)
    return [
      null,
      new IOResult({ exitCode: 1, stderr: err }),
      new ExecutionNode({ command: 'sleep', exitCode: 1 }),
    ]
  }
  await new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000))
  return [null, new IOResult(), new ExecutionNode({ command: 'sleep', exitCode: 0 })]
}
