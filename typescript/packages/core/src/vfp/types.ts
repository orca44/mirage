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

export const FileType = Object.freeze({
  DIRECTORY: 'directory',
  TEXT: 'text',
  BINARY: 'binary',
  JSON: 'json',
  CSV: 'csv',
  MARKDOWN: 'markdown',
  IMAGE_PNG: 'image/png',
  IMAGE_JPEG: 'image/jpeg',
  IMAGE_GIF: 'image/gif',
  PDF: 'application/pdf',
  ZIP: 'application/zip',
  GZIP: 'application/gzip',
  GDOC: 'application/vnd.google-apps.document',
  PARQUET: 'parquet',
  ORC: 'orc',
  FEATHER: 'feather',
  HDF5: 'hdf5',
} as const)
export type FileType = (typeof FileType)[keyof typeof FileType] | (string & {})

export const ErrorCode = Object.freeze({
  NOT_FOUND: 'NotFound',
  DENIED: 'Denied',
  CONFLICT: 'Conflict',
  IS_A_DIRECTORY: 'IsADirectory',
  NOT_A_DIRECTORY: 'NotADirectory',
  UNSUPPORTED_FILE_TYPE: 'UnsupportedFileType',
  INVALID_PATH: 'InvalidPath',
  NOT_IMPLEMENTED: 'NotImplemented',
  RATE_LIMITED: 'RateLimited',
  NETWORK: 'Network',
} as const)
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export const MountType = Object.freeze({
  FILESYSTEM: 'filesystem',
  OBJECT_STORE: 'object-store',
  MESSAGING: 'messaging',
  EMAIL: 'email',
  DOCUMENTS: 'documents',
  ISSUE_TRACKER: 'issue-tracker',
  DATABASE: 'database',
  CACHE: 'cache',
  OBSERVABILITY: 'observability',
} as const)
export type MountType = (typeof MountType)[keyof typeof MountType] | (string & {})

export interface Entry {
  name: string
  type: FileType
  size?: number | null
  modified?: string | null
  _meta?: Record<string, unknown>
}

export interface FileStat {
  name: string
  type: FileType
  size?: number | null
  modified?: string | null
  fingerprint?: string | null
  extra?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

export interface Mount {
  path: string
  type: MountType
  writable: boolean
  filetypes: FileType[]
  _meta?: Record<string, unknown>
}

export interface Implementation {
  name: string
  language: string
  version: string
  _meta?: Record<string, unknown>
}

export interface SnapshotInfo {
  id: string
  name?: string | null
  description?: string | null
  parent_id?: string | null
  created: string
  size?: number | null
  _meta?: Record<string, unknown>
}
