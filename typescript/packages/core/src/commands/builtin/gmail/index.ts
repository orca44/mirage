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
import { GMAIL_BASENAME } from './basename.ts'
import { GMAIL_CAT } from './cat.ts'
import { GMAIL_DIRNAME } from './dirname.ts'
import { GMAIL_FIND } from './find.ts'
import { GMAIL_GREP } from './grep.ts'
import { GMAIL_GWS_FORWARD } from './gws_gmail_forward.ts'
import { GMAIL_GWS_READ } from './gws_gmail_read.ts'
import { GMAIL_GWS_REPLY } from './gws_gmail_reply.ts'
import { GMAIL_GWS_REPLY_ALL } from './gws_gmail_reply_all.ts'
import { GMAIL_GWS_SEND } from './gws_gmail_send.ts'
import { GMAIL_GWS_TRIAGE } from './gws_gmail_triage.ts'
import { GMAIL_HEAD } from './head.ts'
import { GMAIL_JQ } from './jq.ts'
import { GMAIL_LS } from './ls.ts'
import { GMAIL_NL } from './nl.ts'
import { GMAIL_REALPATH } from './realpath.ts'
import { GMAIL_RG } from './rg.ts'
import { GMAIL_STAT } from './stat.ts'
import { GMAIL_TAIL } from './tail.ts'
import { GMAIL_TREE } from './tree.ts'
import { GMAIL_WC } from './wc.ts'

export const GMAIL_COMMANDS: readonly RegisteredCommand[] = [
  ...GMAIL_BASENAME,
  ...GMAIL_CAT,
  ...GMAIL_DIRNAME,
  ...GMAIL_FIND,
  ...GMAIL_GREP,
  ...GMAIL_HEAD,
  ...GMAIL_JQ,
  ...GMAIL_LS,
  ...GMAIL_NL,
  ...GMAIL_REALPATH,
  ...GMAIL_RG,
  ...GMAIL_STAT,
  ...GMAIL_TAIL,
  ...GMAIL_TREE,
  ...GMAIL_WC,
  ...GMAIL_GWS_SEND,
  ...GMAIL_GWS_REPLY,
  ...GMAIL_GWS_REPLY_ALL,
  ...GMAIL_GWS_FORWARD,
  ...GMAIL_GWS_TRIAGE,
  ...GMAIL_GWS_READ,
]
