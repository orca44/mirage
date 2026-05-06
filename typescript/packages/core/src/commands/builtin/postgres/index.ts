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
import { POSTGRES_CAT } from './cat.ts'
import { POSTGRES_FIND } from './find.ts'
import { POSTGRES_GREP } from './grep.ts'
import { POSTGRES_HEAD } from './head.ts'
import { POSTGRES_JQ } from './jq.ts'
import { POSTGRES_LS } from './ls.ts'
import { POSTGRES_RG } from './rg.ts'
import { POSTGRES_STAT } from './stat.ts'
import { POSTGRES_TAIL } from './tail.ts'
import { POSTGRES_TREE } from './tree.ts'
import { POSTGRES_WC } from './wc.ts'

export const POSTGRES_COMMANDS: readonly RegisteredCommand[] = [
  ...POSTGRES_LS,
  ...POSTGRES_STAT,
  ...POSTGRES_CAT,
  ...POSTGRES_HEAD,
  ...POSTGRES_TAIL,
  ...POSTGRES_WC,
  ...POSTGRES_FIND,
  ...POSTGRES_TREE,
  ...POSTGRES_JQ,
  ...POSTGRES_GREP,
  ...POSTGRES_RG,
]
