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

import type { IndexCacheStore } from '../../cache/index/store.ts'
import type { PathSpec } from '../../types.ts'
import type { S3Accessor } from '../../accessor/s3.ts'
import { createS3Client, isNotFoundError, loadS3Module, s3Key, streamToBuffer } from './_client.ts'

export interface S3ReadOptions {
  offset?: number
  size?: number
}

export async function read(
  accessor: S3Accessor,
  path: PathSpec,
  _index?: IndexCacheStore,
  options: S3ReadOptions = {},
): Promise<Uint8Array> {
  const original = path.original
  const prefix = path.prefix
  const rawPath =
    prefix !== '' && original.startsWith(prefix) ? original.slice(prefix.length) || '/' : original
  const key = s3Key(rawPath)
  const { config } = accessor
  const { GetObjectCommand } = await loadS3Module(config)
  const client = await createS3Client(config)
  const input: Record<string, unknown> = { Bucket: config.bucket, Key: key }
  if (options.offset !== undefined || options.size !== undefined) {
    const start = options.offset ?? 0
    const end = options.size !== undefined ? start + options.size - 1 : ''
    input.Range = `bytes=${String(start)}-${String(end)}`
  }
  try {
    const resp = (await (
      client as unknown as {
        send: (cmd: unknown) => Promise<{ Body?: unknown }>
      }
    ).send(new GetObjectCommand(input))) as { Body?: unknown }
    return await streamToBuffer(resp.Body)
  } catch (err) {
    if (isNotFoundError(err)) {
      const e = new Error(`S3 object not found: ${rawPath}`) as Error & { code: string }
      e.code = 'ENOENT'
      throw e
    }
    throw err
  } finally {
    ;(client as unknown as { destroy?: () => void }).destroy?.()
  }
}
