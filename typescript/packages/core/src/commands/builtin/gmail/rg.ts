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

import type { GmailAccessor } from '../../../accessor/gmail.ts'
import { resolveGlob } from '../../../core/gmail/glob.ts'
import { read as gmailRead } from '../../../core/gmail/read.ts'
import { readdir as gmailReaddir } from '../../../core/gmail/readdir.ts'
import { detectScope } from '../../../core/gmail/scope.ts'
import { formatGrepResults, searchMessages } from '../../../core/gmail/search.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { compilePattern, grepLines, type GrepLinesOptions } from '../grep_helper.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

async function collectFiles(
  accessor: GmailAccessor,
  path: PathSpec,
  index: CommandOpts['index'],
): Promise<string[]> {
  if (path.original.endsWith('.json') || path.original.endsWith('.jsonl')) {
    return [path.original]
  }
  let children: string[]
  try {
    children = await gmailReaddir(accessor, path, index ?? undefined)
  } catch {
    return []
  }
  const files: string[] = []
  for (const child of children) {
    if (child.endsWith('.gmail.json')) {
      files.push(child)
    } else {
      const childSpec = new PathSpec({
        original: child,
        directory: child,
        resolved: false,
        prefix: path.prefix,
      })
      files.push(...(await collectFiles(accessor, childSpec, index)))
    }
  }
  return files
}

async function rgCommand(
  accessor: GmailAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (texts.length === 0 || texts[0] === undefined) {
    return [
      null,
      new IOResult({ exitCode: 2, stderr: ENC.encode('rg: usage: rg [flags] pattern [path]\n') }),
    ]
  }
  const pattern = texts[0]
  const ignoreCase = opts.flags.i === true
  const invert = opts.flags.v === true
  const lineNumbers = opts.flags.n === true
  const countOnly = opts.flags.c === true
  const filesOnly = opts.flags.args_l === true || opts.flags.l === true
  const wholeWord = opts.flags.w === true
  const fixedString = opts.flags.F === true
  const onlyMatching = opts.flags.o === true
  const maxCount = typeof opts.flags.m === 'string' ? Number.parseInt(opts.flags.m, 10) : null
  const hidden = opts.flags.hidden === true
  const pat = compilePattern(pattern, ignoreCase, fixedString, wholeWord)

  const lineOpts: GrepLinesOptions = {
    invert,
    lineNumbers,
    countOnly,
    filesOnly,
    onlyMatching,
    maxCount,
  }

  if (paths.length > 0) {
    const first = paths[0]
    if (first !== undefined) {
      const scope = detectScope(first)
      if (scope.useNative) {
        const filePrefix = first.prefix !== '' ? first.prefix : ''
        const rows = await searchMessages(
          accessor.tokenManager,
          pattern,
          scope.labelName,
          scope.dateStr,
          maxCount ?? 50,
        )
        const lines = formatGrepResults(rows, scope, filePrefix, pattern)
        if (lines.length === 0) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
        const out: ByteSource = ENC.encode(lines.join('\n') + '\n')
        return [out, new IOResult()]
      }
    }

    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    const filePrefix = resolved[0]?.prefix ?? ''
    const blobPaths: string[] = []
    for (const p of resolved) blobPaths.push(...(await collectFiles(accessor, p, opts.index)))
    const sortedUnique = [...new Set(blobPaths)].sort()
    const allResults: string[] = []
    let anyMatch = false
    for (const bp of sortedUnique) {
      if (!hidden && bp.split('/').some((part) => part.startsWith('.'))) continue
      let data: Uint8Array
      try {
        const spec = new PathSpec({
          original: bp,
          directory: bp,
          resolved: true,
          prefix: filePrefix,
        })
        data = await gmailRead(accessor, spec, opts.index ?? undefined)
      } catch {
        continue
      }
      const text = DEC.decode(data)
      if (text === '') continue
      const lines = text.split('\n')
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      const matched = grepLines(bp, lines, pat, lineOpts)
      if (matched.length === 0) continue
      anyMatch = true
      if (filesOnly) {
        allResults.push(bp)
        continue
      }
      if (countOnly) {
        allResults.push(`${bp}:${String(matched.length)}`)
        continue
      }
      for (const line of matched) allResults.push(`${bp}:${line}`)
    }
    if (!anyMatch) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
    const out: ByteSource = ENC.encode(allResults.join('\n'))
    return [out, new IOResult()]
  }

  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [
      null,
      new IOResult({ exitCode: 2, stderr: ENC.encode('rg: usage: rg [flags] pattern path\n') }),
    ]
  }
  const lines = DEC.decode(raw).split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  const matched = grepLines('<stdin>', lines, pat, lineOpts)
  if (matched.length === 0) return [new Uint8Array(0), new IOResult({ exitCode: 1 })]
  if (countOnly) return [ENC.encode(String(matched.length)), new IOResult()]
  const out: ByteSource = ENC.encode(matched.join('\n'))
  return [out, new IOResult()]
}

export const GMAIL_RG = command({
  name: 'rg',
  resource: ResourceName.GMAIL,
  spec: specOf('rg'),
  fn: rgCommand,
})
