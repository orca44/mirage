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

import type { GDriveAccessor } from '../../accessor/gdrive.ts'
import { readdir as coreReaddir } from '../../core/gdrive/readdir.ts'
import type { OpKwargs, RegisteredOp } from '../registry.ts'
import { type PathSpec, ResourceName } from '../../types.ts'

export const readdirOp: RegisteredOp = {
  name: 'readdir',
  resource: ResourceName.GDRIVE,
  filetype: null,
  write: false,
  fn: (accessor: GDriveAccessor, path: PathSpec, _args: readonly unknown[], kwargs: OpKwargs) => {
    return coreReaddir(accessor, path, kwargs.index)
  },
}
