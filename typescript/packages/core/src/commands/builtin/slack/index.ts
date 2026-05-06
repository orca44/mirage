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
import { SLACK_BASENAME } from './basename.ts'
import { SLACK_CAT } from './cat.ts'
import { SLACK_DIRNAME } from './dirname.ts'
import { SLACK_FIND } from './find.ts'
import { SLACK_GREP } from './grep.ts'
import { SLACK_HEAD } from './head.ts'
import { SLACK_JQ } from './jq.ts'
import { SLACK_LS } from './ls.ts'
import { SLACK_REALPATH } from './realpath.ts'
import { SLACK_RG } from './rg.ts'
import { SLACK_ADD_REACTION } from './slack_add_reaction.ts'
import { SLACK_GET_USER_PROFILE } from './slack_get_user_profile.ts'
import { SLACK_GET_USERS } from './slack_get_users.ts'
import { SLACK_POST_MESSAGE } from './slack_post_message.ts'
import { SLACK_REPLY_TO_THREAD } from './slack_reply_to_thread.ts'
import { SLACK_SEARCH } from './slack_search.ts'
import { SLACK_STAT } from './stat.ts'
import { SLACK_TAIL } from './tail.ts'
import { SLACK_TREE } from './tree.ts'
import { SLACK_WC } from './wc.ts'

export const SLACK_COMMANDS: readonly RegisteredCommand[] = [
  ...SLACK_LS,
  ...SLACK_TREE,
  ...SLACK_CAT,
  ...SLACK_HEAD,
  ...SLACK_TAIL,
  ...SLACK_WC,
  ...SLACK_FIND,
  ...SLACK_GREP,
  ...SLACK_RG,
  ...SLACK_STAT,
  ...SLACK_JQ,
  ...SLACK_BASENAME,
  ...SLACK_DIRNAME,
  ...SLACK_REALPATH,
  ...SLACK_POST_MESSAGE,
  ...SLACK_REPLY_TO_THREAD,
  ...SLACK_ADD_REACTION,
  ...SLACK_GET_USERS,
  ...SLACK_GET_USER_PROFILE,
  ...SLACK_SEARCH,
]
