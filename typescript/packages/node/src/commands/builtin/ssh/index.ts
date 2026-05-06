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

import type { RegisteredCommand } from '@struktoai/mirage-core'
import { SSH_BASENAME } from './basename.ts'
import { SSH_CAT } from './cat/cat.ts'
import { SSH_CP } from './cp.ts'
import { SSH_DIRNAME } from './dirname.ts'
import { SSH_DU } from './du.ts'
import { SSH_FILE } from './file/file.ts'
import { SSH_FIND } from './find.ts'
import { SSH_GREP } from './grep/grep.ts'
import { SSH_HEAD } from './head/head.ts'
import { SSH_JQ } from './jq.ts'
import { SSH_LS } from './ls/ls.ts'
import { SSH_MKDIR } from './mkdir.ts'
import { SSH_MV } from './mv.ts'
import { SSH_REALPATH } from './realpath.ts'
import { SSH_RG } from './rg.ts'
import { SSH_RM } from './rm.ts'
import { SSH_STAT } from './stat/stat.ts'
import { SSH_TAIL } from './tail/tail.ts'
import { SSH_TOUCH } from './touch.ts'
import { SSH_TREE } from './tree.ts'
import { SSH_WC } from './wc/wc.ts'

export const SSH_COMMANDS: readonly RegisteredCommand[] = [
  ...SSH_LS,
  ...SSH_TREE,
  ...SSH_CAT,
  ...SSH_HEAD,
  ...SSH_TAIL,
  ...SSH_WC,
  ...SSH_FIND,
  ...SSH_GREP,
  ...SSH_RG,
  ...SSH_STAT,
  ...SSH_JQ,
  ...SSH_DU,
  ...SSH_FILE,
  ...SSH_BASENAME,
  ...SSH_DIRNAME,
  ...SSH_REALPATH,
  ...SSH_CP,
  ...SSH_MV,
  ...SSH_RM,
  ...SSH_MKDIR,
  ...SSH_TOUCH,
]
