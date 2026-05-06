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

import { du as ramDu, duAll as ramDuAll } from '../../../core/ram/du.ts'
import type { RAMAccessor } from '../../../accessor/ram.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { PathSpec, ResourceName } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'

function humanSize(n: number): string {
  const units = ['', 'K', 'M', 'G', 'T']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  const s = v >= 10 || i === 0 ? Math.round(v).toString() : v.toFixed(1)
  return `${s}${units[i] ?? ''}`
}

async function duCommand(
  accessor: RAMAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const human = opts.flags.h === true
  const all = opts.flags.a === true
  const cumulative = opts.flags.c === true
  const targets =
    paths.length > 0 ? paths : [new PathSpec({ original: '/', directory: '/', resolved: false })]
  const lines: string[] = []
  const fmt = (size: number): string => (human ? humanSize(size) : String(size))
  let grand = 0
  for (const root of targets) {
    if (all) {
      try {
        const [entries, total] = await ramDuAll(accessor, root)
        for (const [p, size] of entries) lines.push(`${fmt(size)}\t${p}`)
        lines.push(`${fmt(total)}\t${root.original}`)
        grand += total
      } catch {
        lines.push(`${fmt(0)}\t${root.original}`)
      }
    } else {
      let total = 0
      try {
        total = await ramDu(accessor, root)
      } catch {
        total = 0
      }
      lines.push(`${fmt(total)}\t${root.original}`)
      grand += total
    }
  }
  if (cumulative) {
    lines.push(`${fmt(grand)}\ttotal`)
  }
  const out: ByteSource = new TextEncoder().encode(lines.join('\n'))
  return [out, new IOResult()]
}

export const RAM_DU = command({
  name: 'du',
  resource: ResourceName.RAM,
  spec: specOf('du'),
  fn: duCommand,
})
