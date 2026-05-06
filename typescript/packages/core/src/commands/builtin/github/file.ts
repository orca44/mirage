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
import { resolveGlob } from '../../../core/github/glob.ts'
import { read as githubRead } from '../../../core/github/read.ts'
import { stat as githubStat } from '../../../core/github/stat.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { FileType, ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { detectFileType, formatFileResult } from '../file_helper.ts'
import { specOf } from '../../spec/builtins.ts'

const ENC = new TextEncoder()

async function fileCommand(
  accessor: GitHubAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  if (paths.length === 0) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('file: missing operand\n') })]
  }
  const resolved = await resolveGlob(accessor, paths, opts.index ?? undefined)
  const first = resolved[0]
  if (first === undefined) return [null, new IOResult()]
  const brief = opts.flags.b === true
  const mime = opts.flags.i === true
  const s = await githubStat(accessor, first, opts.index ?? undefined)
  let result: FileType
  if (s.type === FileType.DIRECTORY) {
    result = FileType.DIRECTORY
  } else {
    let header: Uint8Array
    try {
      const data = await githubRead(accessor, first, opts.index ?? undefined)
      header = data.subarray(0, 512)
    } catch {
      header = new Uint8Array(0)
    }
    result = detectFileType(header, s)
  }
  const line = formatFileResult(first.original, result, brief, mime)
  const out: ByteSource = ENC.encode(line)
  return [out, new IOResult()]
}

export const GITHUB_FILE = command({
  name: 'file',
  resource: ResourceName.GITHUB,
  spec: specOf('file'),
  fn: fileCommand,
})
