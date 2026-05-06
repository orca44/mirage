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

import type {
  CapabilityDeclaration,
  CommandCapabilities,
  PosixCapabilities,
  PosixOpSupport,
} from './capability.ts'
import type { Mount } from './types.ts'

export type SkillFormat = 'markdown' | 'text'

export interface SkillOptions {
  format?: SkillFormat
}

export function render(declaration: CapabilityDeclaration, opts: SkillOptions = {}): string {
  const format: SkillFormat = opts.format ?? 'markdown'
  const h1 = format === 'markdown' ? '# ' : ''
  const h2 = format === 'markdown' ? '## ' : ''

  const impl = declaration.implementation
  const caps = declaration.capabilities

  const lines: string[] = []
  lines.push(`${h1}${impl.name} workspace (${impl.language} ${impl.version})`)
  lines.push('')

  lines.push(`${h2}Mounts`)
  if (caps.mounts.length === 0) {
    lines.push('- (none)')
  } else {
    for (const m of caps.mounts) lines.push(renderMount(m))
  }
  lines.push('')

  lines.push(`${h2}Filesystem operations`)
  lines.push(...renderPosix(caps.posix))
  lines.push('')

  lines.push(`${h2}Commands`)
  lines.push(...renderCommands(caps.commands))
  lines.push('')

  const ws = caps.workspace
  if (ws.snapshot || ws.load || ws.list || ws.delete || ws.info) {
    lines.push(`${h2}Workspace lifecycle`)
    for (const name of ['snapshot', 'load', 'list', 'delete', 'info'] as const) {
      if (ws[name]) lines.push(`- workspace/${name}`)
    }
    lines.push('')
  }

  lines.push(`${h2}Path rules`)
  lines.push('- Paths are absolute (start with `/`).')
  lines.push('- Glob patterns are accepted only on `fs/glob`.')
  lines.push('- Other ops reject patterns with `InvalidPath`.')

  return lines.join('\n').trimEnd() + '\n'
}

function renderMount(m: Mount): string {
  const rw = m.writable ? 'writable' : 'read-only'
  const types = m.filetypes.length ? m.filetypes.join(', ') : 'any'
  return `- \`${m.path}\` — ${m.type} (${rw}). Filetypes: ${types}`
}

function renderPosix(p: PosixCapabilities): string[] {
  const out: string[] = []
  const typedOps = ['read', 'write'] as const
  const boolOps = ['readdir', 'stat', 'unlink', 'mkdir', 'rmdir', 'rename', 'glob'] as const

  for (const op of typedOps) {
    const support: PosixOpSupport = p[op]
    if (support === false) continue
    if (support === true) {
      out.push(`- \`fs/${op}\` — any filetype`)
    } else {
      const types = support.filetypes.length ? support.filetypes.join(', ') : '(none)'
      out.push(`- \`fs/${op}\` — supports: ${types}`)
    }
  }
  for (const op of boolOps) {
    if (p[op]) out.push(`- \`fs/${op}\``)
  }
  if (out.length === 0) out.push('- (none)')
  return out
}

function renderCommands(c: CommandCapabilities): string[] {
  const out: string[] = []
  for (const name of Object.keys(c)) {
    const support = c[name]
    if (support === undefined || support === false) continue
    if (support === true) {
      out.push(`- \`${name}\``)
      continue
    }
    const bits: string[] = []
    if (support.filetypes?.length) {
      bits.push('filetypes: ' + support.filetypes.join(', '))
    }
    if (support.flags) {
      const f = support.flags
      if (f.only?.length) bits.push('flags: ' + f.only.join(', '))
      else {
        if (f.include?.length) bits.push('extra flags: ' + f.include.join(', '))
        if (f.exclude?.length) bits.push('missing flags: ' + f.exclude.join(', '))
      }
    }
    const suffix = bits.length ? ' — ' + bits.join('; ') : ''
    out.push(`- \`${name}\`${suffix}`)
  }
  if (out.length === 0) out.push('- (none)')
  return out
}
