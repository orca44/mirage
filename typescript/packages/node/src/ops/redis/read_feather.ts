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

import {
  featherCat,
  type OpKwargs,
  type PathSpec,
  type RegisteredOp,
  ResourceName,
} from '@struktoai/mirage-core'
import type { RedisAccessor } from '../../accessor/redis.ts'
import { read as coreRead } from '../../core/redis/read.ts'

export const readFeatherOp: RegisteredOp = {
  name: 'read',
  resource: ResourceName.REDIS,
  filetype: '.feather',
  write: false,
  fn: async (
    accessor: RedisAccessor,
    path: PathSpec,
    _args: readonly unknown[],
    kwargs: OpKwargs,
  ) => {
    const raw = await coreRead(accessor, path, kwargs.index)
    return featherCat(raw)
  },
}
