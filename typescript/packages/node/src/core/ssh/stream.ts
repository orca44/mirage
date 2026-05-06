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

import type { PathSpec } from '@struktoai/mirage-core'
import type { SSHAccessor } from '../../accessor/ssh.ts'
import { enoent, isNoSuchFile, joinRoot, stripPrefix } from './utils.ts'

export async function* stream(accessor: SSHAccessor, p: PathSpec): AsyncIterable<Uint8Array> {
  const sftp = await accessor.sftp()
  const virtual = stripPrefix(p)
  const remote = joinRoot(accessor.config.root ?? '/', virtual)
  const rs = sftp.createReadStream(remote)
  try {
    for await (const chunk of rs) {
      const buf = chunk as Buffer
      yield new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    }
  } catch (err) {
    if (isNoSuchFile(err)) throw enoent(virtual)
    throw err
  }
}

export async function rangeRead(
  accessor: SSHAccessor,
  p: PathSpec,
  start: number,
  end: number,
): Promise<Uint8Array> {
  const sftp = await accessor.sftp()
  const virtual = stripPrefix(p)
  const remote = joinRoot(accessor.config.root ?? '/', virtual)
  const rs = sftp.createReadStream(remote, { start, end: end - 1 })
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for await (const chunk of rs) {
      const buf = chunk as Buffer
      const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
      chunks.push(u8)
      total += u8.byteLength
    }
  } catch (err) {
    if (isNoSuchFile(err)) throw enoent(virtual)
    throw err
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}
