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

import { stat as ramStat } from '../../../../core/ram/stat.ts'
import { read as ramRead } from '../../../../core/ram/read.ts'
import type { RAMAccessor } from '../../../../accessor/ram.ts'
import { IOResult, type ByteSource } from '../../../../io/types.ts'
import { FileType, ResourceName, type PathSpec } from '../../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../../config.ts'
import { detectFileType, formatFileResult } from '../../file_helper.ts'
import { specOf } from '../../../spec/builtins.ts'

const ENC = new TextEncoder()

async function fileCommand(
  accessor: RAMAccessor,
  paths: PathSpec[],
  texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('file: missing operand\n') })]
  }
  const brief = opts.flags.b === true
  const mime = opts.flags.i === true
  const lines: string[] = []
  for (const p of paths) {
    const s = await ramStat(accessor, p)
    if (s.type === FileType.DIRECTORY) {
      lines.push(formatFileResult(p.original, FileType.DIRECTORY, brief, mime))
      continue
    }
    let header: Uint8Array
    try {
      const raw = await ramRead(accessor, p)
      header = raw.subarray(0, 512)
    } catch {
      header = new Uint8Array(0)
    }
    const result = detectFileType(header, s)
    lines.push(formatFileResult(p.original, result, brief, mime))
  }
  const out: ByteSource = ENC.encode(lines.join('\n'))
  return [out, new IOResult()]
}

export const RAM_FILE = command({
  name: 'file',
  resource: ResourceName.RAM,
  spec: specOf('file'),
  fn: fileCommand,
})
