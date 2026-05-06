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

import type { RegisteredCommand } from '../../config.ts'
import { MONGODB_CAT } from './cat.ts'
import { MONGODB_FIND } from './find.ts'
import { MONGODB_GREP } from './grep.ts'
import { MONGODB_HEAD } from './head.ts'
import { MONGODB_JQ } from './jq.ts'
import { MONGODB_LS } from './ls.ts'
import { MONGODB_RG } from './rg.ts'
import { MONGODB_STAT } from './stat.ts'
import { MONGODB_TAIL } from './tail.ts'
import { MONGODB_TREE } from './tree.ts'
import { MONGODB_WC } from './wc.ts'

export const MONGODB_COMMANDS: readonly RegisteredCommand[] = [
  ...MONGODB_LS,
  ...MONGODB_STAT,
  ...MONGODB_CAT,
  ...MONGODB_HEAD,
  ...MONGODB_TAIL,
  ...MONGODB_WC,
  ...MONGODB_FIND,
  ...MONGODB_TREE,
  ...MONGODB_JQ,
  ...MONGODB_GREP,
  ...MONGODB_RG,
]
