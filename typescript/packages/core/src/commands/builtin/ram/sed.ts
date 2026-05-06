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

import { writeBytes as ramWrite } from '../../../core/ram/write.ts'
import { stream as ramStream } from '../../../core/ram/stream.ts'
import type { RAMAccessor } from '../../../accessor/ram.ts'
import { IOResult, materialize, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import {
  executeProgram,
  parseOneCommand,
  parseProgram,
  translateReplacement,
  type SedCommand,
} from '../sed_helper.ts'
import { readStdinAsync } from '../utils/stream.ts'

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8', { fatal: false })

async function readFile(accessor: RAMAccessor, p: PathSpec): Promise<Uint8Array> {
  return materialize(ramStream(accessor, p))
}

async function sedCommand(
  accessor: RAMAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const script = texts[0]
  if (script === undefined) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('sed: missing script\n') })]
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
    if (isSimpleSub) {
      const pat = first.pattern ?? ''
      const repl = translateReplacement(first.replacement ?? '')
      const ef = first.exprFlags ?? ''
      const ignoreCase = ef.includes('i')
      const global = ef.includes('g')
      const flags = (ignoreCase ? 'i' : '') + (global ? 'g' : '')
      if (inPlace) {
        const writes: Record<string, Uint8Array> = {}
        for (const p of paths) {
          const data = await readFile(accessor, p)
          const text = DEC.decode(data)
          const newText = text.replace(new RegExp(pat, flags), repl)
          const newData = ENC.encode(newText)
          await ramWrite(accessor, p, newData)
          writes[p.stripPrefix] = newData
        }
        return [null, new IOResult({ writes, cache: paths.map((p) => p.stripPrefix) })]
      }
      const outputs: string[] = []
      for (const p of paths) {
        const data = await readFile(accessor, p)
        const text = DEC.decode(data)
        outputs.push(text.replace(new RegExp(pat, flags), repl))
      }
      const out: ByteSource = ENC.encode(outputs.join(''))
      return [out, new IOResult({ cache: paths.map((p) => p.stripPrefix) })]
    }

    const modifying = inPlace && commands.some((c) => c.cmd === 's' || c.cmd === 'd')
    const allOutputs: string[] = []
    const writes: Record<string, Uint8Array> = {}
    for (const p of paths) {
      const data = await readFile(accessor, p)
      const text = DEC.decode(data)
      const result = executeProgram(text, commands, suppress)
      if (modifying) {
        const newData = ENC.encode(result)
        await ramWrite(accessor, p, newData)
        writes[p.stripPrefix] = newData
      } else {
        allOutputs.push(result)
      }
    }
    if (modifying) {
      return [null, new IOResult({ writes, cache: paths.map((p) => p.stripPrefix) })]
    }
    const out: ByteSource = ENC.encode(allOutputs.join('\n'))
    return [out, new IOResult()]
  }

  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('sed: missing operand\n') })]
  }
  const text = DEC.decode(raw)
  const result = executeProgram(text, commands, suppress)
  return [ENC.encode(result), new IOResult()]
}

export const RAM_SED = command({
  name: 'sed',
  resource: ResourceName.RAM,
  spec: specOf('sed'),
  fn: sedCommand,
})
