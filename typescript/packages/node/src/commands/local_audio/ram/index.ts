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
import { RAM_LOCAL_AUDIO_CAT_MP3 } from './cat_mp3.ts'
import { RAM_LOCAL_AUDIO_CAT_OGG } from './cat_ogg.ts'
import { RAM_LOCAL_AUDIO_CAT_WAV } from './cat_wav.ts'
import { RAM_LOCAL_AUDIO_GREP_MP3 } from './grep_mp3.ts'
import { RAM_LOCAL_AUDIO_GREP_OGG } from './grep_ogg.ts'
import { RAM_LOCAL_AUDIO_GREP_WAV } from './grep_wav.ts'
import { RAM_LOCAL_AUDIO_HEAD_MP3 } from './head_mp3.ts'
import { RAM_LOCAL_AUDIO_HEAD_OGG } from './head_ogg.ts'
import { RAM_LOCAL_AUDIO_HEAD_WAV } from './head_wav.ts'
import { RAM_LOCAL_AUDIO_STAT_MP3 } from './stat_mp3.ts'
import { RAM_LOCAL_AUDIO_STAT_OGG } from './stat_ogg.ts'
import { RAM_LOCAL_AUDIO_STAT_WAV } from './stat_wav.ts'
import { RAM_LOCAL_AUDIO_TAIL_MP3 } from './tail_mp3.ts'
import { RAM_LOCAL_AUDIO_TAIL_OGG } from './tail_ogg.ts'
import { RAM_LOCAL_AUDIO_TAIL_WAV } from './tail_wav.ts'

export const RAM_LOCAL_AUDIO_COMMANDS: readonly RegisteredCommand[] = [
  ...RAM_LOCAL_AUDIO_CAT_WAV,
  ...RAM_LOCAL_AUDIO_CAT_MP3,
  ...RAM_LOCAL_AUDIO_CAT_OGG,
  ...RAM_LOCAL_AUDIO_HEAD_WAV,
  ...RAM_LOCAL_AUDIO_HEAD_MP3,
  ...RAM_LOCAL_AUDIO_HEAD_OGG,
  ...RAM_LOCAL_AUDIO_TAIL_WAV,
  ...RAM_LOCAL_AUDIO_TAIL_MP3,
  ...RAM_LOCAL_AUDIO_TAIL_OGG,
  ...RAM_LOCAL_AUDIO_GREP_WAV,
  ...RAM_LOCAL_AUDIO_GREP_MP3,
  ...RAM_LOCAL_AUDIO_GREP_OGG,
  ...RAM_LOCAL_AUDIO_STAT_WAV,
  ...RAM_LOCAL_AUDIO_STAT_MP3,
  ...RAM_LOCAL_AUDIO_STAT_OGG,
]
