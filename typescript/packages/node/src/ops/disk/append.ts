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

import type { PathSpec, RegisteredOp } from '@struktoai/mirage-core'
import { ResourceName } from '@struktoai/mirage-core'
import type { DiskAccessor } from '../../accessor/disk.ts'
import { appendBytes as coreAppend } from '../../core/disk/append.ts'

export const appendOp: RegisteredOp = {
  name: 'append',
  resource: ResourceName.DISK,
  filetype: null,
  write: true,
  fn: (accessor: DiskAccessor, path: PathSpec, args: readonly unknown[]) => {
    const data = args[0]
    if (!(data instanceof Uint8Array)) {
      throw new TypeError('append op requires a Uint8Array as the first arg')
    }
    return coreAppend(accessor, path, data)
  },
}
