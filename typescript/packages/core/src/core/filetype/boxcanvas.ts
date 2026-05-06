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

interface DocNode {
  type?: string
  text?: string
  content?: DocNode[]
}

interface WidgetData {
  type?: string
  content?: DocNode
}

interface BoxcanvasWidget {
  id?: string
  userId?: string
  createdTs?: number
  lastModifiedTs?: number
  lastModifiedBy?: string
  data?: WidgetData
}

interface BoxcanvasRaw {
  board?: { id?: string; fileId?: string }
  widgets?: BoxcanvasWidget[]
}

export interface BoxcanvasProcessedWidget {
  id: string
  type: string
  user_id: string
  created_at: string
  modified_at: string
  modified_by: string
  text: string
}

export interface BoxcanvasProcessed {
  id: string
  widget_count: number
  widgets_by_type: Record<string, number>
  body_text: string
  widgets: BoxcanvasProcessedWidget[]
  authors: string[]
}

function extractText(node: DocNode | undefined): string {
  if (node === undefined) return ''
  if (node.type === 'text' && typeof node.text === 'string') return node.text
  if (Array.isArray(node.content)) {
    return node.content
      .map((c) => {
        const t = extractText(c)
        // Add newline after each paragraph for readability.
        return c.type === 'paragraph' ? t + '\n' : t
      })
      .join('')
  }
  return ''
}

function tsToIso(ts: number | undefined): string {
  if (typeof ts !== 'number') return ''
  // Box canvas timestamps are seconds, not ms.
  return new Date(ts * 1000).toISOString()
}

/**
 * Restructures Box's raw .boxcanvas JSON into a clean, agent-friendly shape:
 * widget counts by type, concatenated body_text from all widgets that carry
 * doc content, and per-widget metadata. Mirrors the boxnote / gdocs pattern.
 */
export function processBoxcanvas(rawBytes: Uint8Array): Uint8Array {
  const text = DEC.decode(rawBytes)
  const raw = JSON.parse(text) as BoxcanvasRaw
  const widgets = Array.isArray(raw.widgets) ? raw.widgets : []
  const byType: Record<string, number> = {}
  const authors = new Set<string>()
  const bodyParts: string[] = []
  const processed: BoxcanvasProcessedWidget[] = []
  for (const w of widgets) {
    const type = w.data?.type ?? 'unknown'
    byType[type] = (byType[type] ?? 0) + 1
    if (typeof w.userId === 'string' && w.userId !== '') authors.add(w.userId)
    if (typeof w.lastModifiedBy === 'string' && w.lastModifiedBy !== '') {
      authors.add(w.lastModifiedBy)
    }
    const widgetText = extractText(w.data?.content).replace(/\n+$/, '')
    if (widgetText !== '') bodyParts.push(widgetText)
    processed.push({
      id: w.id ?? '',
      type,
      user_id: w.userId ?? '',
      created_at: tsToIso(w.createdTs),
      modified_at: tsToIso(w.lastModifiedTs),
      modified_by: w.lastModifiedBy ?? '',
      text: widgetText,
    })
  }
  const out: BoxcanvasProcessed = {
    id: raw.board?.id ?? '',
    widget_count: widgets.length,
    widgets_by_type: byType,
    body_text: bodyParts.join('\n'),
    widgets: processed,
    authors: [...authors],
  }
  return ENC.encode(JSON.stringify(out, null, 2) + '\n')
}
