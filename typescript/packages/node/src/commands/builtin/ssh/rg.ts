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
  FileType,
  IOResult,
  PathSpec,
  ResourceName,
  command,
  compilePattern,
  exitOnEmpty,
  grepStream,
  materialize,
  resolveSource,
  rgFolderFiletype,
  rgFull,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
  type FileStat,
} from '@struktoai/mirage-core'
import { readdir as sshReaddir } from '../../../core/ssh/readdir.ts'
import { stat as sshStat } from '../../../core/ssh/stat.ts'
import { stream as sshStream } from '../../../core/ssh/stream.ts'
import { find as sshFind } from '../../../core/ssh/find.ts'
import type { SSHAccessor } from '../../../accessor/ssh.ts'
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
  accessor: SSHAccessor,
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

  let isDir = false
  try {
    const s = await sshStat(accessor, first)
    isDir = s.type === FileType.DIRECTORY
  } catch {
    try {
      await sshReaddir(accessor, first)
      isDir = true
    } catch {
      // not readable
    }
  }

  if (isDir && opts.filetypeFns !== null && Object.keys(opts.filetypeFns).length > 0) {
    const readdirFn = async (p: string): Promise<string[]> => {
      const keys = await sshFind(accessor, makeSpec(p, first), { type: null })
      return keys
    }
    const statFn = (p: string): Promise<FileStat> => sshStat(accessor, makeSpec(p, first))
    const readBytesFn = (p: string): Promise<Uint8Array> =>
      materialize(sshStream(accessor, makeSpec(p, first)))
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
    flags.filesOnly ||
    flags.beforeContext > 0 ||
    flags.afterContext > 0 ||
    flags.fileType !== null ||
    flags.globPattern !== null
  if (needsFull) {
    const readdirFn = async (p: string): Promise<string[]> => {
      const keys = await sshFind(accessor, makeSpec(p, first), { type: null })
      return keys
    }
    const statFn = (p: string): Promise<FileStat> => sshStat(accessor, makeSpec(p, first))
    const readBytesFn = (p: string): Promise<Uint8Array> =>
      materialize(sshStream(accessor, makeSpec(p, first)))
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

  return grepImpl('rg', accessor, paths, texts, opts)
}

function makeSpec(path: string, template: PathSpec): PathSpec {
  return new PathSpec({
    original: path,
    directory: path,
    resolved: false,
    prefix: template.prefix,
  })
}

export const SSH_RG = command({
  name: 'rg',
  resource: ResourceName.SSH,
  spec: specOf('rg'),
  fn: rgCommand,
})
