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

import type { SlackAccessor } from '../../../accessor/slack.ts'
import { resolveSlackGlob } from '../../../core/slack/glob.ts'
import { read as slackRead } from '../../../core/slack/read.ts'
import { IOResult, type ByteSource } from '../../../io/types.ts'
import { ResourceName, type PathSpec } from '../../../types.ts'
import { command, type CommandFnResult, type CommandOpts } from '../../config.ts'
import { specOf } from '../../spec/builtins.ts'
import { parseN, tailBytes } from '../tail_helper.ts'
import { readStdinAsync } from '../utils/stream.ts'
import { fileReadProvision } from './_provision.ts'

const ENC = new TextEncoder()

function tailResult(
  raw: Uint8Array,
  lines: number,
  plusMode: boolean,
  bytesMode: number | null,
): Uint8Array {
  if (bytesMode !== null) {
    return bytesMode === 0 ? new Uint8Array(0) : raw.slice(-bytesMode)
  }
  return tailBytes(raw, lines, null, plusMode)
}

async function tailCommand(
  accessor: SlackAccessor,
  paths: PathSpec[],
  _texts: string[],
  opts: CommandOpts,
): Promise<CommandFnResult> {
  const nRaw = typeof opts.flags.n === 'string' ? opts.flags.n : null
  const cRaw = typeof opts.flags.c === 'string' ? opts.flags.c : null
  const [lines, plusMode] = parseN(nRaw)
  const bytesMode = cRaw !== null ? Number.parseInt(cRaw, 10) : null
  if (paths.length > 0) {
    const resolved = await resolveSlackGlob(accessor, paths, opts.index ?? undefined)
    const first = resolved[0]
    if (first === undefined) return [null, new IOResult()]
    const raw = await slackRead(accessor, first, opts.index ?? undefined)
    const out: ByteSource = tailResult(raw, lines, plusMode, bytesMode)
    return [out, new IOResult()]
  }
  const raw = await readStdinAsync(opts.stdin)
  if (raw === null) {
    return [null, new IOResult({ exitCode: 1, stderr: ENC.encode('tail: missing operand\n') })]
  }
  return [tailResult(raw, lines, plusMode, bytesMode), new IOResult()]
}

export const SLACK_TAIL = command({
  name: 'tail',
  resource: ResourceName.SLACK,
  spec: specOf('tail'),
  fn: tailCommand,
  provision: fileReadProvision,
})
