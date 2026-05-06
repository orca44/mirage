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

import { Language, type Node, Parser } from 'web-tree-sitter'

export interface ShellParserConfig {
  engineWasm: Uint8Array | ArrayBuffer
  grammarWasm: Uint8Array | ArrayBuffer
}

export interface ShellParser {
  parse(command: string): Node
}

export type { Node as ShellNode } from 'web-tree-sitter'

export async function createShellParser(config: ShellParserConfig): Promise<ShellParser> {
  await Parser.init({ wasmBinary: toArrayBuffer(config.engineWasm) })
  const language = await Language.load(toUint8(config.grammarWasm))
  const parser = new Parser()
  parser.setLanguage(language)
  return {
    parse(command: string): Node {
      const tree = parser.parse(command)
      if (tree === null) {
        throw new Error('shell parse returned null')
      }
      return tree.rootNode
    },
  }
}

function toArrayBuffer(bytes: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) return bytes
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function toUint8(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
}
