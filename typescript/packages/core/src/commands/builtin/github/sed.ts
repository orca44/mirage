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

import type { GitHubAccessor } from '../../../accessor/github.ts'
import { read as githubRead } from '../../../core/github/read.ts'
import { resolveGlob } from '../../../core/github/glob.ts'
import { stream as githubStream } from '../../../core/github/read.ts'
import { IOResult, materialize, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { executeProgram, parseOneCommand, parseProgram, type SedCommand } from '../sed_helper.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

async function sedCommand(
  accessor: GitHubAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const script = texts[0]
  if (script === undefined) {
    return [
      null,
      new IOResult({ exitCode: 1, stderr: ENC.encode('sed: usage: sed EXPRESSION [path]\n') }),
    ]
  }
  const suppress = opts.flags.n === true
  const inPlace = opts.flags.i === true
  let commands: SedCommand[]
  try {
    if (script.includes(';') || script.includes('{')) {
      commands = parseProgram(script)
    } else {
      commands = [parseOneCommand(script)[0]]
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode(`${msg}\n`) })]
  }
  const first = commands[0]
  const isSimpleSub =
    commands.length === 1 &&
    first?.cmd === 's' &&
    (first.addrStart === null || first.addrStart === undefined) &&
    !suppress

  if (paths.length > 0) {
    const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
    if (isSimpleSub) {
      const pat = first.pattern ?? ''
      const repl = first.replacement ?? ''
      const ef = first.exprFlags ?? ''
      const ignoreCase = ef.includes('i')
      const global = ef.includes('g')
      const flags = (ignoreCase ? 'i' : '') + (global ? 'g' : '')
      if (inPlace) {
        return [
          null,
          new IOResult({
            exitCode: 1,
            stderr: ENC.encode('sed: in-place editing not supported on github (read-only)\n'),
          }),
        ]
      }
      const outputs: string[] = []
      for (const p of resolved) {
        const data = await githubRead(accessor, p, opts.index ?? undefined)
        const text = DEC.decode(data)
        outputs.push(text.replace(new RegExp(pat, flags), repl))
      }
      const out: ByteSource = ENC.encode(outputs.join(''))
      return [out, new IOResult({ cache: resolved.map((p) => p.original) })]
    }

    const p = resolved[0]
    if (p === undefined) return [null, new IOResult()]
    const data = await materialize(githubStream(accessor, p, opts.index ?? undefined))
    const text = DEC.decode(data)
    const result = executeProgram(text, commands, suppress)
    const modifying = inPlace && commands.some((c) => c.cmd === 's' || c.cmd === 'd')
    if (modifying) {
      return [
        null,
        new IOResult({
          exitCode: 1,
          stderr: ENC.encode('sed: in-place editing not supported on github (read-only)\n'),
        }),
      ]
    }
    return [ENC.encode(result), new IOResult()]
  }

  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [
      null,
      new IOResult({ exitCode: 1, stderr: ENC.encode('sed: usage: sed EXPRESSION path\n') }),
    ]
  }
  const text = DEC.decode(raw)
  const result = executeProgram(text, commands, suppress)
  return [ENC.encode(result), new IOResult()]
}

export const GITHUB_SED = command({
  name: 'sed',
  resource: ResourceName.GITHUB,
  spec: specOf('sed'),
  fn: sedCommand,
})
