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

import type { S3Accessor } from '../../../accessor/s3.ts'
import { read as s3Read } from '../../../core/s3/read.ts'
import { resolveGlob } from '../../../core/s3/glob.ts'
import { write as s3Write } from '../../../core/s3/write.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

function splitLinesNoTrailing(text: string): string[] {
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text
  return stripped === '' ? [] : stripped.split('\n')
}

function splitByPatterns(lines: readonly string[], patterns: readonly string[]): string[][] {
  const parts: string[][] = []
  let currentStart = 0
  for (const pat of patterns) {
    if (pat.startsWith('/') && pat.endsWith('/')) {
      const regex = new RegExp(pat.slice(1, -1))
      for (let idx = currentStart; idx < lines.length; idx++) {
        if (regex.test(lines[idx] ?? '')) {
          parts.push(lines.slice(currentStart, idx))
          currentStart = idx
          break
        }
      }
    } else {
      const lineNum = Number.parseInt(pat, 10)
      const splitAt = lineNum - 1
      if (splitAt > currentStart) {
        parts.push(lines.slice(currentStart, splitAt))
        currentStart = splitAt
      }
    }
  }
  if (currentStart < lines.length) {
    parts.push(lines.slice(currentStart))
  }
  return parts
}

function padNum(n: number, digits: number): string {
  const s = String(n)
  return s.length >= digits ? s : '0'.repeat(digits - s.length) + s
}

function makePathSpec(original: string, prefix: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: false, prefix })
}

async function csplitCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const prefix = typeof opts.flags.f === 'string' ? opts.flags.f : 'xx'
  const digits = typeof opts.flags.n === 'string' ? Number.parseInt(opts.flags.n, 10) : 2
  const quiet = opts.flags.s === true
  const keep = opts.flags.k === true
  let raw: Uint8Array
  let mountPrefix = ''
  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    mountPrefix = first.prefix
    raw = await s3Read(accessor, first)
  } else {
    const stdinData = await readStdinAsync(opts.stdin)
    if (stdinData === null) {
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('csplit: missing input\n') })]
    }
    raw = stdinData
  }
  const text = DEC.decode(raw)
  const lines = splitLinesNoTrailing(text)
  const parts = splitByPatterns(lines, texts)
  const writes: Record<string, Uint8Array> = {}
  const sizes: string[] = []
  try {
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx] ?? []
      const filename = prefix + padNum(idx, digits)
      const data = part.length > 0 ? ENC.encode(part.join('\n') + '\n') : new Uint8Array(0)
      await s3Write(accessor, makePathSpec(filename, mountPrefix), data)
      writes[filename] = data
      sizes.push(String(data.byteLength))
    }
  } catch (err) {
    if (!keep) {
      const msg = err instanceof Error ? err.message : String(err)
      return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`csplit: ${msg}\n`) })]
    }
  }
  const output = quiet ? '' : sizes.join('\n') + '\n'
  const result: ByteSource = ENC.encode(output)
  return [result, new IOResult({ writes })]
}

export const S3_CSPLIT = command({
  name: 'csplit',
  resource: ResourceName.S3,
  spec: specOf('csplit'),
  fn: csplitCommand,
  write: true,
})
