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

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  '\\': '\\',
  n: '\n',
  t: '\t',
  r: '\r',
  a: '\x07',
  b: '\b',
  f: '\f',
  v: '\v',
})

const HEX_CHARS = new Set('0123456789abcdefABCDEF')
const OCT_CHARS = new Set('01234567')

export function interpretEscapes(text: string): string {
  const out: string[] = []
  let i = 0
  const n = text.length
  while (i < n) {
    if (text[i] !== '\\' || i + 1 >= n) {
      out.push(text[i] ?? '')
      i += 1
      continue
    }
    const ch = text[i + 1] ?? ''
    const simple = SIMPLE_ESCAPES[ch]
    if (simple !== undefined) {
      out.push(simple)
      i += 2
    } else if (ch === 'c') {
      break
    } else if (ch === 'x') {
      const digits: string[] = []
      let j = i + 2
      while (j < n && digits.length < 2 && HEX_CHARS.has(text[j] ?? '')) {
        digits.push(text[j] ?? '')
        j += 1
      }
      if (digits.length > 0) {
        out.push(String.fromCharCode(parseInt(digits.join(''), 16)))
        i = j
      } else {
        out.push('\\x')
        i += 2
      }
    } else if (ch === '0') {
      const digits: string[] = []
      let j = i + 2
      while (j < n && digits.length < 3 && OCT_CHARS.has(text[j] ?? '')) {
        digits.push(text[j] ?? '')
        j += 1
      }
      out.push(digits.length > 0 ? String.fromCharCode(parseInt(digits.join(''), 8)) : '\0')
      i = j
    } else {
      out.push('\\')
      out.push(ch)
      i += 2
    }
  }
  return out.join('')
}
