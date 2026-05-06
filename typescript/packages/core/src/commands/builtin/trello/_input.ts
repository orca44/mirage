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

import { readBytes } from '../../../core/trello/read.ts'
import type { TrelloTransport } from '../../../core/trello/_client.ts'
import { readStdinAsync } from '../utils/stream.ts'
import type { CommandOpts } from '../../config.ts'

const DEC = new TextDecoder('utf-8', { fatal: false })

export interface ResolveTextInputOptions {
  inlineText: string | null
  filePath: string | null
  stdin: CommandOpts['stdin']
  errorMessage: string
}

export async function resolveTextInput(
  transport: TrelloTransport,
  opts: ResolveTextInputOptions,
): Promise<string> {
  if (opts.inlineText !== null && opts.inlineText !== '') return opts.inlineText
  if (opts.filePath !== null && opts.filePath !== '') {
    const stripped = opts.filePath.replace(/^\/+|\/+$/g, '')
    const path = stripped !== '' ? `/${stripped}` : '/'
    const data = await readBytes(transport, path)
    return DEC.decode(data)
  }
  const raw = await readStdinAsync(opts.stdin)
  if (raw !== null) return DEC.decode(raw)
  throw new Error(opts.errorMessage)
}
