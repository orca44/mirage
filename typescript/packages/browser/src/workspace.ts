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
  createShellParser,
  type Resource,
  type ShellParser,
  Workspace as CoreWorkspace,
  type WorkspaceOptions,
} from '@struktoai/mirage-core'
import { ENGINE_WASM_BASE64, GRAMMAR_WASM_BASE64 } from './generated/wasm.ts'

let cachedParser: Promise<ShellParser> | null = null

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function loadShellParser(): Promise<ShellParser> {
  if (cachedParser !== null) return cachedParser
  cachedParser = createShellParser({
    engineWasm: base64ToBytes(ENGINE_WASM_BASE64),
    grammarWasm: base64ToBytes(GRAMMAR_WASM_BASE64),
  })
  return cachedParser
}

function randomSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`
}

export class Workspace extends CoreWorkspace {
  constructor(resources: Record<string, Resource>, options: WorkspaceOptions = {}) {
    super(resources, {
      ...options,
      sessionId: options.sessionId ?? randomSessionId(),
      shellParserFactory: options.shellParserFactory ?? loadShellParser,
    })
  }
}
