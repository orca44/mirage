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
import { NOTION_BASENAME } from './basename.ts'
import { NOTION_CAT } from './cat.ts'
import { NOTION_DIRNAME } from './dirname.ts'
import { NOTION_FIND } from './find.ts'
import { NOTION_GREP } from './grep.ts'
import { NOTION_HEAD } from './head.ts'
import { NOTION_JQ } from './jq.ts'
import { NOTION_LS } from './ls.ts'
import { NOTION_PAGE_CREATE } from './notion_page_create.ts'
import { NOTION_REALPATH } from './realpath.ts'
import { NOTION_RG } from './rg.ts'
import { NOTION_STAT } from './stat.ts'
import { NOTION_TAIL } from './tail.ts'
import { NOTION_TREE } from './tree.ts'
import { NOTION_WC } from './wc.ts'

export const NOTION_COMMANDS: readonly RegisteredCommand[] = [
  ...NOTION_LS,
  ...NOTION_TREE,
  ...NOTION_CAT,
  ...NOTION_HEAD,
  ...NOTION_TAIL,
  ...NOTION_WC,
  ...NOTION_FIND,
  ...NOTION_GREP,
  ...NOTION_RG,
  ...NOTION_STAT,
  ...NOTION_JQ,
  ...NOTION_BASENAME,
  ...NOTION_DIRNAME,
  ...NOTION_REALPATH,
  ...NOTION_PAGE_CREATE,
]
