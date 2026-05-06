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

import { ResourceName } from '../types.ts'

export interface OpRecordInit {
  op: string
  path: string
  source: string
  bytes: number
  timestamp: number
  durationMs: number
}

export class OpRecord {
  readonly op: string
  readonly path: string
  readonly source: string
  bytes: number
  readonly timestamp: number
  durationMs: number

  constructor(init: OpRecordInit) {
    this.op = init.op
    this.path = init.path
    this.source = init.source
    this.bytes = init.bytes
    this.timestamp = init.timestamp
    this.durationMs = init.durationMs
  }

  get isCache(): boolean {
    return this.source === ResourceName.RAM
  }

  toJSON(): Record<string, unknown> {
    return {
      op: this.op,
      path: this.path,
      source: this.source,
      bytes: this.bytes,
      timestamp: this.timestamp,
      durationMs: this.durationMs,
    }
  }
}
