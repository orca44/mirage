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

import { posixNormpath } from '../../workspace/expand/classify.ts'
import { AMBIGUOUS_NAMES } from './constants.ts'
import { type CommandSpec, OperandKind, ParsedArgs } from './types.ts'

export function resolvePath(cwd: string, path: string): string {
  if (path.startsWith('/')) return posixNormpath(path)
  return posixNormpath(`${cwd.replace(/\/+$/, '')}/${path}`)
}

export function parseCommand(spec: CommandSpec, argv: string[], cwd: string): ParsedArgs {
  const boolFlags = new Set<string>()
  const valueFlags = new Set<string>()
  const longBoolFlags = new Set<string>()
  const longValueFlags = new Set<string>()
  const valueFlagKinds = new Map<string, OperandKind>()
  let numericShorthandFlag: string | null = null

  for (const opt of spec.options) {
    if (opt.short !== null) {
      if (opt.valueKind === OperandKind.NONE) {
        boolFlags.add(opt.short)
      } else {
        valueFlags.add(opt.short)
        if (opt.valueKind === OperandKind.PATH) {
          valueFlagKinds.set(opt.short, OperandKind.PATH)
        }
        if (opt.numericShorthand) numericShorthandFlag = opt.short
      }
    }
    if (opt.long !== null) {
      if (opt.valueKind === OperandKind.NONE) {
        longBoolFlags.add(opt.long)
      } else {
        longValueFlags.add(opt.long)
        if (opt.valueKind === OperandKind.PATH) {
          valueFlagKinds.set(opt.long, OperandKind.PATH)
        }
      }
    }
  }

  const positional: OperandKind[] = spec.positional.map((op) => op.kind)
  const restKind: OperandKind | null = spec.rest !== null ? spec.rest.kind : null

  const cachePaths: string[] = []
  const filteredArgv: string[] = []
  let i = 0
  while (i < argv.length) {
    const cur = argv[i]
    if (cur === '--cache') {
      i += 1
      for (;;) {
        const next = argv[i]
        if (next === undefined || next.startsWith('-')) break
        cachePaths.push(resolvePath(cwd, next))
        i += 1
      }
    } else {
      if (cur !== undefined) filteredArgv.push(cur)
      i += 1
    }
  }

  const flags: Record<string, string | boolean> = {}
  const rawArgs: string[] = []
  i = 0
  let endOfFlags = false

  while (i < filteredArgv.length) {
    const tok = filteredArgv[i]
    if (tok === undefined) break

    if (tok === '--' && !endOfFlags) {
      endOfFlags = true
      i += 1
      continue
    }

    if (endOfFlags) {
      rawArgs.push(tok)
      i += 1
      continue
    }

    if (tok.startsWith('--')) {
      if (longBoolFlags.has(tok)) {
        flags[tok] = true
        i += 1
      } else if (longValueFlags.has(tok) && i + 1 < filteredArgv.length) {
        flags[tok] = filteredArgv[i + 1] ?? ''
        i += 2
      } else {
        rawArgs.push(tok)
        i += 1
      }
      continue
    }

    if (tok.startsWith('-') && tok.length > 1) {
      if (numericShorthandFlag !== null && /^-\d+$/.test(tok)) {
        flags[numericShorthandFlag] = tok.slice(1)
        i += 1
        continue
      }
      let matchedValue = false
      for (const vf of valueFlags) {
        if (tok === vf && i + 1 < filteredArgv.length) {
          flags[vf] = filteredArgv[i + 1] ?? ''
          i += 2
          matchedValue = true
          break
        }
        if (tok.startsWith(vf) && tok.length > vf.length) {
          flags[vf] = tok.slice(vf.length)
          i += 1
          matchedValue = true
          break
        }
      }
      if (matchedValue) continue

      if (boolFlags.has(tok)) {
        flags[tok] = true
        i += 1
        continue
      }

      let allBool = true
      for (const ch of tok.slice(1)) {
        if (!boolFlags.has(`-${ch}`)) {
          allBool = false
          break
        }
      }
      if (allBool && tok.length > 1) {
        for (const ch of tok.slice(1)) flags[`-${ch}`] = true
        i += 1
        continue
      }

      rawArgs.push(tok)
      i += 1
      continue
    }

    rawArgs.push(tok)
    i += 1
  }

  const classified: [string, OperandKind][] = []
  for (let j = 0; j < rawArgs.length; j++) {
    const arg = rawArgs[j]
    if (arg === undefined) continue
    let kind: OperandKind
    if (j < positional.length) {
      kind = positional[j] ?? OperandKind.TEXT
    } else if (restKind !== null) {
      kind = restKind
    } else {
      continue
    }
    if (kind === OperandKind.PATH) {
      classified.push([resolvePath(cwd, arg), OperandKind.PATH])
    } else {
      classified.push([arg, OperandKind.TEXT])
    }
  }

  const pathFlagValues: string[] = []
  for (const [flagName, kind] of valueFlagKinds) {
    if (kind === OperandKind.PATH && flagName in flags) {
      const val = flags[flagName]
      if (typeof val === 'string') {
        const resolved = resolvePath(cwd, val)
        flags[flagName] = resolved
        pathFlagValues.push(resolved)
      }
    }
  }

  return new ParsedArgs({ flags, args: classified, cachePaths, pathFlagValues })
}

export function parseToKwargs(parsed: ParsedArgs): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {}
  for (const [key, value] of Object.entries(parsed.flags)) {
    let clean = key.replace(/^-+/, '').replaceAll('-', '_')
    clean = AMBIGUOUS_NAMES[clean] ?? clean
    result[clean] = value
  }
  return result
}
