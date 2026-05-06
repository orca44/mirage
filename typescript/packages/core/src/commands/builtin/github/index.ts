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
import { GITHUB_AWK } from './awk.ts'
import { GITHUB_BASENAME } from './basename.ts'
import { GITHUB_CAT } from './cat.ts'
import { GITHUB_CUT } from './cut.ts'
import { GITHUB_DIFF } from './diff.ts'
import { GITHUB_DIRNAME } from './dirname.ts'
import { GITHUB_DU } from './du.ts'
import { GITHUB_FILE } from './file.ts'
import { GITHUB_FIND } from './find.ts'
import { GITHUB_GREP } from './grep.ts'
import { GITHUB_HEAD } from './head.ts'
import { GITHUB_JQ } from './jq.ts'
import { GITHUB_LS } from './ls.ts'
import { GITHUB_MD5 } from './md5.ts'
import { GITHUB_NL } from './nl.ts'
import { GITHUB_REALPATH } from './realpath.ts'
import { GITHUB_RG } from './rg.ts'
import { GITHUB_SED } from './sed.ts'
import { GITHUB_SHA256SUM } from './sha256sum.ts'
import { GITHUB_SORT } from './sort.ts'
import { GITHUB_STAT } from './stat.ts'
import { GITHUB_TAIL } from './tail.ts'
import { GITHUB_TR } from './tr.ts'
import { GITHUB_TREE } from './tree.ts'
import { GITHUB_UNIQ } from './uniq.ts'
import { GITHUB_WC } from './wc.ts'

export const GITHUB_COMMANDS: readonly RegisteredCommand[] = [
  ...GITHUB_LS,
  ...GITHUB_TREE,
  ...GITHUB_CAT,
  ...GITHUB_HEAD,
  ...GITHUB_TAIL,
  ...GITHUB_WC,
  ...GITHUB_FIND,
  ...GITHUB_GREP,
  ...GITHUB_RG,
  ...GITHUB_STAT,
  ...GITHUB_JQ,
  ...GITHUB_BASENAME,
  ...GITHUB_DIRNAME,
  ...GITHUB_REALPATH,
  ...GITHUB_AWK,
  ...GITHUB_CUT,
  ...GITHUB_DIFF,
  ...GITHUB_DU,
  ...GITHUB_FILE,
  ...GITHUB_MD5,
  ...GITHUB_NL,
  ...GITHUB_SED,
  ...GITHUB_SHA256SUM,
  ...GITHUB_SORT,
  ...GITHUB_TR,
  ...GITHUB_UNIQ,
]
