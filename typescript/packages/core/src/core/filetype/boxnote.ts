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

const ENC = new TextEncoder()
const DEC = new TextDecoder('utf-8')

interface BoxnoteMark {
  type?: string
  attrs?: Record<string, unknown>
}

interface BoxnoteNode {
  type?: string
  text?: string
  content?: BoxnoteNode[]
  marks?: BoxnoteMark[]
  attrs?: Record<string, unknown>
}

interface BoxnoteRaw {
  version?: number
  schema_version?: number
  doc?: BoxnoteNode
  savepoint_metadata?: {
    savepointFileId?: string
    allAuthorNames?: Record<string, string>
    authorsSinceLastSavepoint?: Record<string, boolean>
  }
  last_edit_timestamp?: number
}

export interface BoxnoteParagraph {
  text: string
  authors: string[]
}

export interface BoxnoteProcessed {
  id: string
  body_text: string
  paragraphs: BoxnoteParagraph[]
  authors: Record<string, string>
  last_edit_at: string
}

function extractText(node: BoxnoteNode): string {
  if (node.type === 'text' && typeof node.text === 'string') return node.text
  if (Array.isArray(node.content)) return node.content.map(extractText).join('')
  return ''
}

function extractAuthors(node: BoxnoteNode, out: Set<string>): void {
  if (Array.isArray(node.marks)) {
    for (const m of node.marks) {
      if (m.type === 'author_id' && m.attrs !== undefined) {
        const id = m.attrs.authorId
        if (typeof id === 'string') out.add(id)
      }
    }
  }
  if (Array.isArray(node.content)) {
    for (const c of node.content) extractAuthors(c, out)
  }
}

function extractParagraphs(content: BoxnoteNode[] | undefined): BoxnoteParagraph[] {
  if (!Array.isArray(content)) return []
  const out: BoxnoteParagraph[] = []
  for (const node of content) {
    if (node.type === 'paragraph') {
      const authors = new Set<string>()
      extractAuthors(node, authors)
      out.push({ text: extractText(node), authors: [...authors] })
    }
  }
  return out
}

/**
 * Restructures Box's raw .boxnote JSON into a clean, agent-friendly shape
 * with a top-level body_text field for one-shot reads. Mirrors the gdocs
 * read pattern.
 */
export function processBoxnote(rawBytes: Uint8Array): Uint8Array {
  const text = DEC.decode(rawBytes)
  const raw = JSON.parse(text) as BoxnoteRaw
  const paragraphs = extractParagraphs(raw.doc?.content)
  const bodyText = paragraphs.map((p) => p.text).join('\n')
  const processed: BoxnoteProcessed = {
    id: raw.savepoint_metadata?.savepointFileId ?? '',
    body_text: bodyText,
    paragraphs,
    authors: raw.savepoint_metadata?.allAuthorNames ?? {},
    last_edit_at:
      typeof raw.last_edit_timestamp === 'number'
        ? new Date(raw.last_edit_timestamp).toISOString()
        : '',
  }
  return ENC.encode(JSON.stringify(processed, null, 2) + '\n')
}
