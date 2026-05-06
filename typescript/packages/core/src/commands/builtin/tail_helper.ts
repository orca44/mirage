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

export function parseN(n: string | null): [number, boolean] {
  if (n === null) return [10, false]
  if (n.startsWith('+')) return [Number.parseInt(n.slice(1), 10), true]
  return [Number.parseInt(n, 10), false]
}

export function tailBytes(
  data: Uint8Array,
  lines: number,
  bytesMode: number | null = null,
  plusMode = false,
): Uint8Array {
  if (bytesMode !== null) {
    if (bytesMode === 0) return new Uint8Array(0)
    const start = Math.max(0, data.byteLength - bytesMode)
    return data.slice(start)
  }
  const parts = splitLines(data)
  const trimmed =
    parts.length > 0 && parts[parts.length - 1]?.byteLength === 0 ? parts.slice(0, -1) : parts
  const selected = plusMode ? trimmed.slice(lines - 1) : trimmed.slice(-lines)
  if (selected.length === 0) return new Uint8Array(0)
  const result = joinWith(selected, 0x0a)
  if (data.byteLength > 0 && data[data.byteLength - 1] === 0x0a) {
    const out = new Uint8Array(result.byteLength + 1)
    out.set(result, 0)
    out[result.byteLength] = 0x0a
    return out
  }
  return result
}

function splitLines(data: Uint8Array): Uint8Array[] {
  const parts: Uint8Array[] = []
  let start = 0
  for (let i = 0; i < data.byteLength; i++) {
    if (data[i] === 0x0a) {
      parts.push(data.subarray(start, i))
      start = i + 1
    }
  }
  parts.push(data.subarray(start))
  return parts
}

function joinWith(parts: readonly Uint8Array[], sep: number): Uint8Array {
  if (parts.length === 0) return new Uint8Array(0)
  let total = 0
  for (const p of parts) total += p.byteLength
  total += parts.length - 1
  const out = new Uint8Array(total)
  let offset = 0
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p === undefined) continue
    out.set(p, offset)
    offset += p.byteLength
    if (i < parts.length - 1) {
      out[offset] = sep
      offset += 1
    }
  }
  return out
}

export function countNewlines(data: Uint8Array): number {
  let n = 0
  for (let i = 0; i < data.byteLength; i++) if (data[i] === 0x0a) n += 1
  return n
}
