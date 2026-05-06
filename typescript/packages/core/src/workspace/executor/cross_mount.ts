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

import type { ByteSource } from '../../io/types.ts'
import { IOResult } from '../../io/types.ts'
import { type PathSpec } from '../../types.ts'
import type { MountRegistry } from '../mount/registry.ts'
import { ExecutionNode } from '../types.ts'

const CROSS_COMMANDS: ReadonlySet<string> = new Set(['cp', 'mv', 'diff', 'cmp'])
const MULTI_READ_COMMANDS: ReadonlySet<string> = new Set([
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'rg',
])

export type DispatchFn = (
  op: string,
  path: PathSpec,
  args?: readonly unknown[],
  kwargs?: Record<string, unknown>,
) => Promise<[unknown, IOResult]>

type Result = [ByteSource | null, IOResult, ExecutionNode]

// Mirrors Python str.splitlines(): drops a single trailing empty
// element produced by a terminating "\n". split("\n") does NOT.
function splitLines(text: string): string[] {
  const parts = text.split('\n')
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts
}

export function isCrossMount(
  cmdName: string,
  scopes: PathSpec[],
  registry: MountRegistry,
): boolean {
  const allowed = new Set<string>([...CROSS_COMMANDS, ...MULTI_READ_COMMANDS])
  if (!allowed.has(cmdName) || scopes.length < 2) return false
  const mounts = new Set<string>()
  for (const s of scopes) {
    const m = registry.mountFor(s.original)
    if (m !== null) mounts.add(m.prefix)
  }
  return mounts.size > 1
}

export async function handleCrossMount(
  cmdName: string,
  scopes: PathSpec[],
  textArgs: string[],
  dispatch: DispatchFn,
  cmdStr: string,
): Promise<Result> {
  try {
    if (cmdName === 'cp') return await crossCp(scopes, dispatch, cmdStr)
    if (cmdName === 'mv') return await crossMv(scopes, dispatch, cmdStr)
    if (cmdName === 'diff') return await crossDiff(scopes, dispatch, cmdStr)
    if (cmdName === 'cmp') return await crossCmp(scopes, dispatch, cmdStr)
    if (MULTI_READ_COMMANDS.has(cmdName)) {
      return await crossMultiRead(cmdName, scopes, textArgs, dispatch, cmdStr)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const errBytes = new TextEncoder().encode(`${cmdName}: ${msg}\n`)
    return [
      null,
      new IOResult({ exitCode: 1, stderr: errBytes }),
      new ExecutionNode({ command: cmdStr, exitCode: 1, stderr: errBytes }),
    ]
  }
  const errBytes = new TextEncoder().encode(`${cmdName}: cross-mount not supported\n`)
  return [
    null,
    new IOResult({ exitCode: 1, stderr: errBytes }),
    new ExecutionNode({ command: cmdStr, exitCode: 1 }),
  ]
}

async function crossCp(scopes: PathSpec[], dispatch: DispatchFn, cmdStr: string): Promise<Result> {
  const [src, dst] = [scopes[0], scopes[1]]
  if (src === undefined || dst === undefined) throw new Error('cp requires 2 paths')
  const [data] = await dispatch('read', src)
  await dispatch('write', dst, [data])
  return [null, new IOResult(), new ExecutionNode({ command: cmdStr, exitCode: 0 })]
}

async function crossMv(scopes: PathSpec[], dispatch: DispatchFn, cmdStr: string): Promise<Result> {
  const [src, dst] = [scopes[0], scopes[1]]
  if (src === undefined || dst === undefined) throw new Error('mv requires 2 paths')
  const [data] = await dispatch('read', src)
  await dispatch('write', dst, [data])
  await dispatch('unlink', src)
  return [null, new IOResult(), new ExecutionNode({ command: cmdStr, exitCode: 0 })]
}

async function crossDiff(
  scopes: PathSpec[],
  dispatch: DispatchFn,
  cmdStr: string,
): Promise<Result> {
  const [a, b] = [scopes[0], scopes[1]]
  if (a === undefined || b === undefined) throw new Error('diff requires 2 paths')
  const [dataA] = await dispatch('read', a)
  const [dataB] = await dispatch('read', b)
  const textA = new TextDecoder().decode(dataA as Uint8Array).split('\n')
  const textB = new TextDecoder().decode(dataB as Uint8Array).split('\n')
  const hunks = unifiedDiff(textA, textB, a.original, b.original)
  if (hunks.length === 0) {
    return [new Uint8Array(), new IOResult(), new ExecutionNode({ command: cmdStr, exitCode: 0 })]
  }
  const out = new TextEncoder().encode(hunks.join('\n') + '\n')
  return [out, new IOResult({ exitCode: 1 }), new ExecutionNode({ command: cmdStr, exitCode: 1 })]
}

async function crossCmp(scopes: PathSpec[], dispatch: DispatchFn, cmdStr: string): Promise<Result> {
  const [a, b] = [scopes[0], scopes[1]]
  if (a === undefined || b === undefined) throw new Error('cmp requires 2 paths')
  const [dataA] = await dispatch('read', a)
  const [dataB] = await dispatch('read', b)
  const bufA = dataA as Uint8Array
  const bufB = dataB as Uint8Array
  const minLen = Math.min(bufA.byteLength, bufB.byteLength)
  for (let i = 0; i < minLen; i++) {
    if (bufA[i] !== bufB[i]) {
      const msg = new TextEncoder().encode(
        `${a.original} ${b.original} differ: byte ${(i + 1).toString()}\n`,
      )
      return [
        msg,
        new IOResult({ exitCode: 1 }),
        new ExecutionNode({ command: cmdStr, exitCode: 1 }),
      ]
    }
  }
  if (bufA.byteLength === bufB.byteLength) {
    return [new Uint8Array(), new IOResult(), new ExecutionNode({ command: cmdStr, exitCode: 0 })]
  }
  const shorter = bufA.byteLength < bufB.byteLength ? a.original : b.original
  const msg = new TextEncoder().encode(`cmp: EOF on ${shorter}\n`)
  return [msg, new IOResult({ exitCode: 1 }), new ExecutionNode({ command: cmdStr, exitCode: 1 })]
}

async function crossMultiRead(
  cmdName: string,
  scopes: PathSpec[],
  textArgs: string[],
  dispatch: DispatchFn,
  cmdStr: string,
): Promise<Result> {
  const fileData: [string, Uint8Array][] = []
  const reads: Record<string, ByteSource> = {}
  const cache: string[] = []
  for (const scope of scopes) {
    const [data] = await dispatch('read', scope)
    if (data instanceof Uint8Array) {
      fileData.push([scope.original, data])
      reads[scope.original] = data
      cache.push(scope.original)
    }
  }
  const io = new IOResult({ reads, cache })

  if (cmdName === 'cat') {
    const combined = concatAll(fileData.map(([, d]) => d))
    return [combined, io, new ExecutionNode({ command: cmdStr, exitCode: 0 })]
  }

  if (cmdName === 'head' || cmdName === 'tail') {
    let n = 10
    for (let i = 0; i < textArgs.length; i++) {
      if (textArgs[i] === '-n' && i + 1 < textArgs.length) {
        const raw = textArgs[i + 1] ?? ''
        const parsed = Number(raw)
        if (!Number.isInteger(parsed)) {
          const err = new TextEncoder().encode(`${cmdName}: invalid number: '${raw}'\n`)
          return [
            null,
            new IOResult({ exitCode: 1, stderr: err }),
            new ExecutionNode({ command: cmdStr, exitCode: 1, stderr: err }),
          ]
        }
        n = parsed
      }
    }
    const parts: string[] = []
    const multi = fileData.length > 1
    for (const [name, data] of fileData) {
      const lines = splitLines(new TextDecoder().decode(data))
      if (multi) parts.push(`==> ${name} <==`)
      const slice = cmdName === 'head' ? lines.slice(0, n) : lines.slice(-n)
      parts.push(...slice)
    }
    return [
      new TextEncoder().encode(parts.join('\n') + '\n'),
      io,
      new ExecutionNode({ command: cmdStr, exitCode: 0 }),
    ]
  }

  if (cmdName === 'grep' || cmdName === 'rg') {
    const pattern = textArgs[0] ?? ''
    const flags = textArgs.includes('-i') ? 'i' : ''
    const compiled = new RegExp(pattern, flags)
    const results: string[] = []
    for (const [name, data] of fileData) {
      for (const line of splitLines(new TextDecoder().decode(data))) {
        if (compiled.test(line)) results.push(`${name}:${line}`)
      }
    }
    if (results.length === 0) {
      io.exitCode = 1
      return [new Uint8Array(), io, new ExecutionNode({ command: cmdStr, exitCode: 1 })]
    }
    return [
      new TextEncoder().encode(results.join('\n') + '\n'),
      io,
      new ExecutionNode({ command: cmdStr, exitCode: 0 }),
    ]
  }

  if (cmdName === 'wc') {
    const parts: string[] = []
    for (const [name, data] of fileData) {
      const text = new TextDecoder().decode(data)
      const lines = (text.match(/\n/g) ?? []).length
      const words = text.split(/\s+/).filter(Boolean).length
      const chars = data.byteLength
      if (textArgs.includes('-l')) parts.push(`${lines.toString()} ${name}`)
      else if (textArgs.includes('-w')) parts.push(`${words.toString()} ${name}`)
      else if (textArgs.includes('-c')) parts.push(`${chars.toString()} ${name}`)
      else parts.push(`${lines.toString()} ${words.toString()} ${chars.toString()} ${name}`)
    }
    return [
      new TextEncoder().encode(parts.join('\n') + '\n'),
      io,
      new ExecutionNode({ command: cmdStr, exitCode: 0 }),
    ]
  }

  const combined = concatAll(fileData.map(([, d]) => d))
  return [combined, io, new ExecutionNode({ command: cmdStr, exitCode: 0 })]
}

function concatAll(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.byteLength
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

function unifiedDiff(a: string[], b: string[], fromFile: string, toFile: string): string[] {
  const n = a.length
  const m = b.length
  const lcs: number[][] = []
  for (let i = 0; i <= n; i++) lcs.push(new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const here = lcs[i]
      const next = lcs[i + 1]
      if (here === undefined || next === undefined) continue
      if (a[i] === b[j]) {
        here[j] = (next[j + 1] ?? 0) + 1
      } else {
        here[j] = Math.max(next[j] ?? 0, here[j + 1] ?? 0)
      }
    }
  }
  const ops: string[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const here = lcs[i]
    const next = lcs[i + 1]
    if (here === undefined || next === undefined) break
    if (a[i] === b[j]) {
      ops.push(` ${a[i] ?? ''}`)
      i++
      j++
    } else if ((next[j] ?? 0) >= (here[j + 1] ?? 0)) {
      ops.push(`-${a[i] ?? ''}`)
      i++
    } else {
      ops.push(`+${b[j] ?? ''}`)
      j++
    }
  }
  while (i < n) ops.push(`-${a[i++] ?? ''}`)
  while (j < m) ops.push(`+${b[j++] ?? ''}`)
  if (!ops.some((op) => op.startsWith('-') || op.startsWith('+'))) return []
  return [`--- ${fromFile}`, `+++ ${toFile}`, ...ops]
}
