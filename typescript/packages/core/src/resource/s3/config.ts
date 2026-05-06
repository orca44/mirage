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

export type S3BrowserOperation = 'GET' | 'PUT' | 'HEAD' | 'DELETE' | 'LIST' | 'COPY'

export interface S3BrowserSignOptions {
  contentType?: string
  ttlSec?: number
  listPrefix?: string
  listDelimiter?: string
  listContinuationToken?: string
  copySource?: string
}

export type S3BrowserPresignedUrlProvider = (
  path: string,
  operation: S3BrowserOperation,
  options?: S3BrowserSignOptions,
) => Promise<string>

export interface S3Config {
  bucket: string
  region?: string
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  forcePathStyle?: boolean
  timeoutMs?: number
  /**
   * Browser runtime only. When set, core/s3/* skips the AWS SDK entirely
   * and signs every request via this callback (your server-side signer),
   * then fetches the resulting presigned URL. Mirrors Python's boto3
   * session-behind-accessor abstraction — just with a different backend.
   */
  presignedUrlProvider?: S3BrowserPresignedUrlProvider
  /** Optional default Content-Type for PUT via the presigner path. */
  defaultContentType?: string
}

export interface S3ConfigRedacted extends Omit<
  S3Config,
  'accessKeyId' | 'secretAccessKey' | 'sessionToken' | 'presignedUrlProvider'
> {
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
  presignedUrlProvider?: '<REDACTED>'
}

export function redactConfig(config: S3Config): S3ConfigRedacted {
  const { presignedUrlProvider, ...rest } = config
  const out: S3ConfigRedacted = { ...rest }
  if (config.accessKeyId !== undefined) out.accessKeyId = '<REDACTED>'
  if (config.secretAccessKey !== undefined) out.secretAccessKey = '<REDACTED>'
  if (config.sessionToken !== undefined) out.sessionToken = '<REDACTED>'
  if (presignedUrlProvider !== undefined) out.presignedUrlProvider = '<REDACTED>'
  return out
}
