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
import { write as s3Write } from '../../../core/s3/write.ts'
import { IOResult } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

type Hunk = [number, string[]]

function stripPath(path: string, stripCount: number): string {
  const parts = path.split('/')
  if (stripCount < parts.length) return parts.slice(stripCount).join('/')
  return parts[parts.length - 1] ?? ''
}

function splitLinesNoTrailing(text: string): string[] {
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text
  return stripped === '' ? [] : stripped.split('\n')
}

function makePathSpec(original: string, prefix: string): PathSpec {
  return new PathSpec({ original, directory: original, resolved: true, prefix })
}

function applyHunks(
  originalLines: readonly string[],
  hunks: readonly Hunk[],
  forwardOnly: boolean,
): string[] {
  const result: string[] = []
  let srcIdx = 0
  for (const [startLine, hunkLines] of hunks) {
    const hunkStart = startLine - 1
    while (srcIdx < hunkStart && srcIdx < originalLines.length) {
      result.push(originalLines[srcIdx] ?? '')
      srcIdx += 1
    }
    if (forwardOnly) {
      const expected: string[] = []
      for (const hl of hunkLines) {
        if (hl.startsWith(' ') || hl.startsWith('-')) expected.push(hl.slice(1))
      }
      const actual = originalLines.slice(srcIdx, srcIdx + expected.length)
      let mismatch = expected.length !== actual.length
      if (!mismatch) {
        for (let i = 0; i < expected.length; i++) {
          if (expected[i] !== actual[i]) {
            mismatch = true
            break
          }
        }
      }
      if (mismatch) {
        for (const _ of expected) {
          void _
          if (srcIdx < originalLines.length) {
            result.push(originalLines[srcIdx] ?? '')
            srcIdx += 1
          }
        }
        continue
      }
    }
    for (const hl of hunkLines) {
      if (hl.startsWith(' ')) {
        result.push(hl.slice(1))
        srcIdx += 1
      } else if (hl.startsWith('-')) {
        srcIdx += 1
      } else if (hl.startsWith('+')) {
        result.push(hl.slice(1))
      }
    }
  }
  while (srcIdx < originalLines.length) {
    result.push(originalLines[srcIdx] ?? '')
    srcIdx += 1
  }
  return result
}

function parsePatch(patchText: string, stripCount: number): Map<string, Hunk[]> {
  const files = new Map<string, Hunk[]>()
  let currentFile: string | null = null
  let currentHunks: Hunk[] = []
  let currentHunkLines: string[] = []
  let currentStart = 0

  for (const line of patchText.split('\n')) {
    if (line.startsWith('--- ')) continue
    if (line.startsWith('+++ ')) {
      if (currentFile !== null && currentHunkLines.length > 0) {
        currentHunks.push([currentStart, currentHunkLines])
      }
      if (currentFile !== null) files.set(currentFile, currentHunks)
      const rawPath = (line.slice(4).split('\t')[0] ?? '').trim()
      currentFile = '/' + stripPath(rawPath, stripCount).replace(/^\/+/, '')
      currentHunks = []
      currentHunkLines = []
      continue
    }
    const m = /^@@ -(\d+)/.exec(line)
    if (m !== null) {
      if (currentHunkLines.length > 0) {
        currentHunks.push([currentStart, currentHunkLines])
      }
      currentStart = Number.parseInt(m[1] ?? '0', 10)
      currentHunkLines = []
      continue
    }
    if (
      currentFile !== null &&
      (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))
    ) {
      currentHunkLines.push(line)
    }
  }

  if (currentFile !== null && currentHunkLines.length > 0) {
    currentHunks.push([currentStart, currentHunkLines])
  }
  if (currentFile !== null) files.set(currentFile, currentHunks)

  return files
}

async function patchCommand(
  accessor: S3Accessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const stripCount = typeof opts.flags.p === 'string' ? Number.parseInt(opts.flags.p, 10) : 0
  const reverseMode = opts.flags.R === true
  const forwardOnly = opts.flags.N === true
  const iFlag = typeof opts.flags.i === 'string' ? opts.flags.i : null
  const mountPrefix = opts.mountPrefix ?? paths[0]?.prefix ?? ''
  const stripMount = (p: string): string =>
    mountPrefix !== '' && p.startsWith(mountPrefix + '/')
      ? p.slice(mountPrefix.length)
      : p === mountPrefix
        ? '/'
        : p

  let patchData: Uint8Array | null = null
  if (iFlag !== null) {
    const resolved = stripMount(iFlag)
    const spec = new PathSpec({
      original: resolved,
      directory: resolved,
      resolved: true,
      prefix: mountPrefix,
    })
    patchData = await s3Read(accessor, spec, opts.index ?? undefined)
  } else if (paths.length > 0) {
    const first = paths[0]
    if (first !== undefined) patchData = await s3Read(accessor, first, opts.index ?? undefined)
  } else {
    patchData = await readStdinAsync(opts.stdin)
  }
  if (patchData === null || patchData.byteLength === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('patch: missing input\n') })]
  }

  const patchText = DEC.decode(patchData)
  const fileHunks = parsePatch(patchText, stripCount)
  const writes: Record<string, Uint8Array> = {}

  for (const [filePath, hunks] of fileHunks) {
    let original = ''
    try {
      const spec = makePathSpec(filePath, mountPrefix)
      original = DEC.decode(await s3Read(accessor, spec, opts.index ?? undefined))
    } catch (err) {
      if (!(err instanceof Error) || !/not found|ENOENT/i.test(err.message)) throw err
    }
    const originalLines = splitLinesNoTrailing(original)

    let effective = hunks
    if (reverseMode) {
      const reversed: Hunk[] = []
      for (const [start, hunkLines] of hunks) {
        const reversedLines: string[] = []
        for (const hl of hunkLines) {
          if (hl.startsWith('+')) reversedLines.push('-' + hl.slice(1))
          else if (hl.startsWith('-')) reversedLines.push('+' + hl.slice(1))
          else reversedLines.push(hl)
        }
        reversed.push([start, reversedLines])
      }
      effective = reversed
    }

    const patched = applyHunks(originalLines, effective, forwardOnly)
    const patchedData = ENC.encode(patched.join('\n') + '\n')
    await s3Write(accessor, makePathSpec(filePath, mountPrefix), patchedData)
    writes[filePath] = patchedData
  }

  return [null, new IOResult({ writes })]
}

export const S3_PATCH = command({
  name: 'patch',
  resource: ResourceName.S3,
  spec: specOf('patch'),
  fn: patchCommand,
  write: true,
})
