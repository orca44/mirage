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
import { GSHEETS_BASENAME } from './basename.ts'
import { GSHEETS_CAT } from './cat.ts'
import { GSHEETS_DIRNAME } from './dirname.ts'
import { GSHEETS_FIND } from './find.ts'
import { GSHEETS_GREP } from './grep.ts'
import { GSHEETS_GWS_APPEND } from './gws_sheets_append.ts'
import { GSHEETS_GWS_BATCH_UPDATE } from './gws_sheets_spreadsheets_batchUpdate.ts'
import { GSHEETS_GWS_CREATE } from './gws_sheets_spreadsheets_create.ts'
import { GSHEETS_GWS_READ } from './gws_sheets_read.ts'
import { GSHEETS_GWS_WRITE } from './gws_sheets_write.ts'
import { GSHEETS_HEAD } from './head.ts'
import { GSHEETS_JQ } from './jq.ts'
import { GSHEETS_LS } from './ls.ts'
import { GSHEETS_NL } from './nl.ts'
import { GSHEETS_REALPATH } from './realpath.ts'
import { GSHEETS_RG } from './rg.ts'
import { GSHEETS_STAT } from './stat.ts'
import { GSHEETS_TAIL } from './tail.ts'
import { GSHEETS_TREE } from './tree.ts'
import { GSHEETS_WC } from './wc.ts'

export const GSHEETS_COMMANDS: readonly RegisteredCommand[] = [
  ...GSHEETS_BASENAME,
  ...GSHEETS_CAT,
  ...GSHEETS_DIRNAME,
  ...GSHEETS_FIND,
  ...GSHEETS_GREP,
  ...GSHEETS_GWS_APPEND,
  ...GSHEETS_GWS_BATCH_UPDATE,
  ...GSHEETS_GWS_CREATE,
  ...GSHEETS_GWS_READ,
  ...GSHEETS_GWS_WRITE,
  ...GSHEETS_HEAD,
  ...GSHEETS_JQ,
  ...GSHEETS_LS,
  ...GSHEETS_NL,
  ...GSHEETS_REALPATH,
  ...GSHEETS_RG,
  ...GSHEETS_STAT,
  ...GSHEETS_TAIL,
  ...GSHEETS_TREE,
  ...GSHEETS_WC,
]
