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
import { GDOCS_BASENAME } from './basename.ts'
import { GDOCS_CAT } from './cat.ts'
import { GDOCS_DIRNAME } from './dirname.ts'
import { GDOCS_FIND } from './find.ts'
import { GDOCS_GREP } from './grep.ts'
import { GDOCS_GWS_BATCH_UPDATE } from './gws_docs_documents_batchUpdate.ts'
import { GDOCS_GWS_CREATE } from './gws_docs_documents_create.ts'
import { GDOCS_GWS_WRITE } from './gws_docs_write.ts'
import { GDOCS_HEAD } from './head.ts'
import { GDOCS_JQ } from './jq.ts'
import { GDOCS_LS } from './ls.ts'
import { GDOCS_NL } from './nl.ts'
import { GDOCS_REALPATH } from './realpath.ts'
import { GDOCS_RG } from './rg.ts'
import { GDOCS_STAT } from './stat.ts'
import { GDOCS_TAIL } from './tail.ts'
import { GDOCS_TREE } from './tree.ts'
import { GDOCS_WC } from './wc.ts'

export const GDOCS_COMMANDS: readonly RegisteredCommand[] = [
  ...GDOCS_BASENAME,
  ...GDOCS_CAT,
  ...GDOCS_DIRNAME,
  ...GDOCS_FIND,
  ...GDOCS_GREP,
  ...GDOCS_GWS_BATCH_UPDATE,
  ...GDOCS_GWS_CREATE,
  ...GDOCS_GWS_WRITE,
  ...GDOCS_HEAD,
  ...GDOCS_JQ,
  ...GDOCS_LS,
  ...GDOCS_NL,
  ...GDOCS_REALPATH,
  ...GDOCS_RG,
  ...GDOCS_STAT,
  ...GDOCS_TAIL,
  ...GDOCS_TREE,
  ...GDOCS_WC,
]
