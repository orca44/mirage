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
  AsyncLineIterator,
  IOResult,
  ResourceName,
  command,
  resolveSource,
  specOf,
  type CommandFnResult,
  type CommandOpts,
  type PathSpec,
} from '@struktoai/mirage-core'
import { stream as diskStream } from '../../../core/disk/stream.ts'
import type { DiskAccessor } from '../../../accessor/disk.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function shouldNumber(line: string, bodyNumbering: string, pattern: RegExp | null): boolean {
  if (bodyNumbering === 'n') return false
  if (bodyNumbering === 'a') return true
  if (bodyNumbering === 'p' && pattern !== null) return pattern.test(line)
  return line.trim() !== ''
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value
}

interface NlOptions {
  bodyNumbering: string
  start: number
  increment: number
  width: number
  separator: string
  pattern: RegExp | null
}

async function* nlStream(
  source: AsyncIterable<Uint8Array>,
  opts: NlOptions,
): AsyncIterable<Uint8Array> {
  let num = opts.start
  const iter = new AsyncLineIterator(source)
  for await (const raw of iter) {
    const line = DEC.decode(raw)
    if (shouldNumber(line, opts.bodyNumbering, opts.pattern)) {
      yield ENC.encode(`${padLeft(String(num), opts.width)}${opts.separator}${line}\n`)
      num += opts.increment
    } else {
      yield ENC.encode(`${' '.repeat(opts.width)}${opts.separator}${line}\n`)
    }
  }
}

async function* nlMulti(
  accessor: DiskAccessor,
  paths: readonly PathSpec[],
  opts: NlOptions,
): AsyncIterable<Uint8Array> {
  for (const p of paths) {
    for await (const chunk of nlStream(diskStream(accessor, p), opts)) yield chunk
  }
}

function parseOptions(flags: Record<string, string | boolean>): NlOptions {
  const b = typeof flags.b === 'string' ? flags.b : 't'
  let bodyNumbering = b
  let pattern: RegExp | null = null
  if (b.startsWith('p')) {
    bodyNumbering = 'p'
    pattern = new RegExp(b.slice(1))
  }
  const parseIntFlag = (key: 'v' | 'i' | 'w', fallback: number): number =>
    typeof flags[key] === 'string' ? Number.parseInt(flags[key], 10) : fallback
  return {
    bodyNumbering,
    start: parseIntFlag('v', 1),
    increment: parseIntFlag('i', 1),
    width: parseIntFlag('w', 6),
    separator: typeof flags.s === 'string' ? flags.s : '\t',
    pattern,
  }
}

// eslint-disable-next-line @typescript-eslint/require-await
async function nlCommand(
  accessor: DiskAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nlOpts = parseOptions(opts.flags)
  if (paths.length > 0) {
    return [nlMulti(accessor, paths, nlOpts), new IOResult()]
  }
  try {
    const source = resolveSource(opts.stdin, 'nl: missing operand')
    return [nlStream(source, nlOpts), new IOResult()]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
  }
}

export const DISK_NL = command({
  name: 'nl',
  resource: ResourceName.DISK,
  spec: specOf('nl'),
  fn: nlCommand,
})
