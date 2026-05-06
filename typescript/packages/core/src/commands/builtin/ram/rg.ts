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

import { readdir as ramReaddir } from '../../../core/ram/readdir.ts'
import { stat as ramStat } from '../../../core/ram/stat.ts'
import { stream as ramStream } from '../../../core/ram/stream.ts'
import { find as ramFind } from '../../../core/ram/find.ts'
import type { RAMAccessor } from '../../../accessor/ram.ts'
import { IOResult, materialize, type ByteSource } from '../../../io/types.ts'
import { FileType, PathSpec, ResourceName, type FileStat } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { rgFolderFiletype, rgFull } from '../rg_helper.ts'
import { resolveSource } from '../utils/stream.ts'
import { compilePattern, grepStream } from '../grep_helper.ts'
import { exitOnEmpty } from '../../../io/stream.ts'
import { grepImpl } from './grep/grep.ts'

const ENC = new TextEncoder()

interface RgFlags {
  ignoreCase: boolean
  invert: boolean
  lineNumbers: boolean
  countOnly: boolean
  filesOnly: boolean
  wholeWord: boolean
  fixedString: boolean
  onlyMatching: boolean
  maxCount: number | null
  afterContext: number
  beforeContext: number
  fileType: string | null
  globPattern: string | null
  hidden: boolean
}

function parseRgFlags(flags: Record<string, string | boolean>): RgFlags {
  const toInt = (v: string | boolean | undefined): number | null =>
    typeof v === 'string' ? Number.parseInt(v, 10) : null
  const a = toInt(flags.A)
  const b = toInt(flags.B)
  const c = toInt(flags.C)
  return {
    ignoreCase: flags.i === true,
    invert: flags.v === true,
    lineNumbers: flags.n === true,
    countOnly: flags.c === true,
    filesOnly: flags.args_l === true,
    wholeWord: flags.w === true,
    fixedString: flags.F === true,
    onlyMatching: flags.o === true,
    maxCount: toInt(flags.m),
    afterContext: a ?? c ?? 0,
    beforeContext: b ?? c ?? 0,
    fileType: typeof flags.type === 'string' ? flags.type : null,
    globPattern: typeof flags.glob === 'string' ? flags.glob : null,
    hidden: flags.hidden === true,
  }
}

async function rgCommand(
  accessor: RAMAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const [exprText] = texts
  if (exprText === undefined) {
    return [
      null,
      new IOResult({ exitCode: 2, stderr: ENC.encode('rg: usage: rg [flags] pattern [path]\n') }),
    ]
  }
  const flags = parseRgFlags(opts.flags)
  const [first] = paths

  if (first === undefined) {
    // stdin mode
    const source = resolveSource(opts.stdin, 'rg: usage: rg [flags] pattern [path]')
    const pat = compilePattern(exprText, flags.ignoreCase, flags.fixedString, flags.wholeWord)
    const stream = grepStream(source, pat, {
      invert: flags.invert,
      lineNumbers: flags.lineNumbers,
      countOnly: flags.countOnly,
      onlyMatching: flags.onlyMatching,
      maxCount: flags.maxCount,
      afterContext: flags.afterContext,
      beforeContext: flags.beforeContext,
    })
    const io = new IOResult()
    return [exitOnEmpty(stream, io), io]
  }

  // Detect directory vs file
  let isDir = false
  try {
    const s = await ramStat(accessor, first)
    isDir = s.type === FileType.DIRECTORY
  } catch {
    try {
      await ramReaddir(accessor, first)
      isDir = true
    } catch {
      // not readable
    }
  }

  if (isDir && opts.filetypeFns !== null && Object.keys(opts.filetypeFns).length > 0) {
    // Directory recursion with filetype-specific extraction
    const readdirFn = async (p: string): Promise<string[]> => {
      const keys = await ramFind(accessor, makeSpec(p, first), { type: null })
      return keys
    }
    const statFn = (p: string): Promise<FileStat> => ramStat(accessor, makeSpec(p, first))
    const readBytesFn = (p: string): Promise<Uint8Array> =>
      materialize(ramStream(accessor, makeSpec(p, first)))
    const warnings: string[] = []
    const results = await rgFolderFiletype(
      readdirFn,
      statFn,
      readBytesFn,
      first.original,
      exprText,
      {},
      {
        ignoreCase: flags.ignoreCase,
        invert: flags.invert,
        lineNumbers: flags.lineNumbers,
        countOnly: flags.countOnly,
        filesOnly: flags.filesOnly,
        onlyMatching: flags.onlyMatching,
        maxCount: flags.maxCount,
        fixedString: flags.fixedString,
        wholeWord: flags.wholeWord,
        fileType: flags.fileType,
        globPattern: flags.globPattern,
        hidden: flags.hidden,
      },
      warnings,
    )
    const stderr = warnings.length > 0 ? ENC.encode(warnings.join('\n')) : undefined
    if (results.length === 0) {
      const io = new IOResult({ exitCode: 1, ...(stderr !== undefined ? { stderr } : {}) })
      return [new Uint8Array(0), io]
    }
    const out: ByteSource = ENC.encode(results.join('\n'))
    const io = new IOResult(stderr !== undefined ? { stderr } : {})
    return [out, io]
  }

  const needsFull =
    isDir ||
    flags.filesOnly ||
    flags.beforeContext > 0 ||
    flags.afterContext > 0 ||
    flags.fileType !== null ||
    flags.globPattern !== null
  if (needsFull) {
    const readdirFn = async (p: string): Promise<string[]> => {
      const keys = await ramFind(accessor, makeSpec(p, first), { type: null })
      return keys
    }
    const statFn = (p: string): Promise<FileStat> => ramStat(accessor, makeSpec(p, first))
    const readBytesFn = (p: string): Promise<Uint8Array> =>
      materialize(ramStream(accessor, makeSpec(p, first)))
    const warnings: string[] = []
    const results = await rgFull(
      readdirFn,
      statFn,
      readBytesFn,
      first.original,
      exprText,
      {
        ignoreCase: flags.ignoreCase,
        invert: flags.invert,
        lineNumbers: flags.lineNumbers,
        countOnly: flags.countOnly,
        filesOnly: flags.filesOnly,
        fixedString: flags.fixedString,
        onlyMatching: flags.onlyMatching,
        maxCount: flags.maxCount,
        wholeWord: flags.wholeWord,
        contextBefore: flags.beforeContext,
        contextAfter: flags.afterContext,
        fileType: flags.fileType,
        globPattern: flags.globPattern,
        hidden: flags.hidden,
      },
      warnings,
    )
    const stderr = warnings.length > 0 ? ENC.encode(warnings.join('\n')) : undefined
    if (results.length === 0) {
      const io = new IOResult({ exitCode: 1, ...(stderr !== undefined ? { stderr } : {}) })
      return [new Uint8Array(0), io]
    }
    const out: ByteSource = ENC.encode(results.join('\n'))
    const io = new IOResult(stderr !== undefined ? { stderr } : {})
    return [out, io]
  }

  // Fall back to single-file grep semantics for plain file mode.
  return grepImpl('rg', accessor, paths, texts, opts)
}

function makeSpec(path: string, template: PathSpec): PathSpec {
  // Reuse prefix from the first scope so downstream fs helpers treat the
  // absolute path as a normal mount-relative path.
  return new PathSpec({
    original: path,
    directory: path,
    resolved: false,
    prefix: template.prefix,
  })
}

export const RAM_RG = command({
  name: 'rg',
  resource: ResourceName.RAM,
  spec: specOf('rg'),
  fn: rgCommand,
})
