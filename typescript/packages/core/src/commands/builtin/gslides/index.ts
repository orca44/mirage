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
import { GSLIDES_BASENAME } from './basename.ts'
import { GSLIDES_CAT } from './cat.ts'
import { GSLIDES_DIRNAME } from './dirname.ts'
import { GSLIDES_FIND } from './find.ts'
import { GSLIDES_GREP } from './grep.ts'
import { GSLIDES_GWS_BATCH_UPDATE } from './gws_slides_presentations_batchUpdate.ts'
import { GSLIDES_GWS_CREATE } from './gws_slides_presentations_create.ts'
import { GSLIDES_HEAD } from './head.ts'
import { GSLIDES_JQ } from './jq.ts'
import { GSLIDES_LS } from './ls.ts'
import { GSLIDES_NL } from './nl.ts'
import { GSLIDES_REALPATH } from './realpath.ts'
import { GSLIDES_RG } from './rg.ts'
import { GSLIDES_STAT } from './stat.ts'
import { GSLIDES_TAIL } from './tail.ts'
import { GSLIDES_TREE } from './tree.ts'
import { GSLIDES_WC } from './wc.ts'

export const GSLIDES_COMMANDS: readonly RegisteredCommand[] = [
  ...GSLIDES_BASENAME,
  ...GSLIDES_CAT,
  ...GSLIDES_DIRNAME,
  ...GSLIDES_FIND,
  ...GSLIDES_GREP,
  ...GSLIDES_GWS_BATCH_UPDATE,
  ...GSLIDES_GWS_CREATE,
  ...GSLIDES_HEAD,
  ...GSLIDES_JQ,
  ...GSLIDES_LS,
  ...GSLIDES_NL,
  ...GSLIDES_REALPATH,
  ...GSLIDES_RG,
  ...GSLIDES_STAT,
  ...GSLIDES_TAIL,
  ...GSLIDES_TREE,
  ...GSLIDES_WC,
]
