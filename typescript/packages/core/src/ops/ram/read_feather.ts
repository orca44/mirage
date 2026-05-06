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

import { cat as featherCat } from '../../core/filetype/feather.ts'
import { read as coreRead } from '../../core/ram/read.ts'
import type { RAMAccessor } from '../../accessor/ram.ts'
import { type PathSpec, ResourceName } from '../../types.ts'
import type { RegisteredOp } from '../registry.ts'

export const readFeatherOp: RegisteredOp = {
  name: 'read',
  resource: ResourceName.RAM,
  filetype: '.feather',
  write: false,
  fn: async (accessor: RAMAccessor, path: PathSpec) => {
    const raw = await coreRead(accessor, path)
    return featherCat(raw)
  },
}
