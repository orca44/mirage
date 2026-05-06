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
  IOResult,
  PathSpec,
  ResourceName,
  command,
  specOf,
  type ByteSource,
  type CommandFnResult,
  type CommandOpts,
} from '@struktoai/mirage-core'
import { find as sshFind } from '../../../core/ssh/find.ts'
import type { SSHAccessor } from '../../../accessor/ssh.ts'

function parseSize(spec: string): [number | null, number | null] {
  const suffixes: Record<string, number> = { c: 1, k: 1024, M: 1024 ** 2, G: 1024 ** 3 }
  const sign = spec.startsWith('+') ? '+' : spec.startsWith('-') ? '-' : ''
  const raw = sign === '' ? spec : spec.slice(1)
  const lastChar = raw.slice(-1)
  const mult = suffixes[lastChar] ?? 1
  const numPart = lastChar in suffixes ? raw.slice(0, -1) : raw
  const num = Number.parseInt(numPart, 10) * mult
  if (sign === '+') return [num, null]
  if (sign === '-') return [null, num]
  return [num, num]
}

function parseMtime(spec: string): [number | null, number | null] {
  const now = Date.now() / 1000
  const day = 86_400
  const n = Number.parseInt(spec.replace(/^[+-]/, ''), 10)
  if (spec.startsWith('+')) return [null, now - n * day]
  if (spec.startsWith('-')) return [now - n * day, null]
  return [now - (n + 1) * day, now - n * day]
}

function extractNotName(texts: readonly string[]): string | null {
  for (let i = 0; i < texts.length; i++) {
    const pat = texts[i + 2]
    if (texts[i] === '-not' && texts[i + 1] === '-name' && pat !== undefined) {
      return pat
    }
  }
  return null
}

function extractOrNames(name: string | null, texts: readonly string[]): string[] {
  const names: string[] = []
  if (name !== null) names.push(name)
  let i = 0
  while (i < texts.length) {
    const pat = texts[i + 2]
    if (texts[i] === '-or' && texts[i + 1] === '-name' && pat !== undefined) {
      names.push(pat)
      i += 3
    } else {
      i += 1
    }
  }
  return names
}

async function findCommand(
  accessor: SSHAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nameFlag = typeof opts.flags.name === 'string' ? opts.flags.name : null
  const inameFlag = typeof opts.flags.iname === 'string' ? opts.flags.iname : null
  const typeFlag = typeof opts.flags.type === 'string' ? opts.flags.type : null
  const pathFlag = typeof opts.flags.path === 'string' ? opts.flags.path : null
  const maxDepthFlag = typeof opts.flags.maxdepth === 'string' ? opts.flags.maxdepth : null
  const minDepthFlag = typeof opts.flags.mindepth === 'string' ? opts.flags.mindepth : null
  const sizeFlag = typeof opts.flags.size === 'string' ? opts.flags.size : null
  const mtimeFlag = typeof opts.flags.mtime === 'string' ? opts.flags.mtime : null
  const targets =
    paths.length > 0 ? paths : [new PathSpec({ original: '/', directory: '/', resolved: false })]
  const findType: 'f' | 'd' | null = typeFlag === 'f' ? 'f' : typeFlag === 'd' ? 'd' : null
  const maxDepth = maxDepthFlag !== null ? Number.parseInt(maxDepthFlag, 10) : null
  const minDepth = minDepthFlag !== null ? Number.parseInt(minDepthFlag, 10) : null
  const [minSize, maxSize] = sizeFlag !== null ? parseSize(sizeFlag) : [null, null]
  const [mtimeMin, mtimeMax] = mtimeFlag !== null ? parseMtime(mtimeFlag) : [null, null]
  const nameExclude = extractNotName(texts)
  const orNames = extractOrNames(nameFlag, texts)
  const matches: string[] = []
  for (const root of targets) {
    let keys: string[]
    try {
      keys = await sshFind(accessor, root, {
        name: nameFlag,
        iname: inameFlag,
        type: findType,
        ...(maxDepth !== null ? { maxDepth } : {}),
        ...(minDepth !== null ? { minDepth } : {}),
        ...(minSize !== null ? { minSize } : {}),
        ...(maxSize !== null ? { maxSize } : {}),
        ...(mtimeMin !== null ? { mtimeMin } : {}),
        ...(mtimeMax !== null ? { mtimeMax } : {}),
        ...(nameExclude !== null ? { nameExclude } : {}),
        ...(pathFlag !== null ? { pathPattern: pathFlag } : {}),
        ...(orNames.length > 1 ? { orNames } : {}),
      })
    } catch {
      continue
    }
    const rootKey = root.stripPrefix.replace(/\/+$/, '') || '/'
    for (const key of keys) {
      const displayPath =
        root.original === '/'
          ? key
          : root.original.replace(/\/+$/, '') + key.slice(rootKey === '/' ? 0 : rootKey.length)
      matches.push(displayPath)
    }
  }
  matches.sort()
  const out: ByteSource = new TextEncoder().encode(matches.join('\n'))
  return [out, new IOResult()]
}

export const SSH_FIND = command({
  name: 'find',
  resource: ResourceName.SSH,
  spec: specOf('find'),
  fn: findCommand,
})
