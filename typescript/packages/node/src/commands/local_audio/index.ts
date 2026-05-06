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
import { DISK_LOCAL_AUDIO_COMMANDS } from './disk/index.ts'
import { RAM_LOCAL_AUDIO_COMMANDS } from './ram/index.ts'

export {
  configure,
  getConfig,
  transcribe,
  metadata,
  estimateByteRange,
  formatDuration,
  formatMetadata,
  type LocalAudioMetadata,
  type LocalAudioConfig,
  type LocalAudioTranscriber,
} from './utils.ts'

export { DISK_LOCAL_AUDIO_COMMANDS } from './disk/index.ts'
export { RAM_LOCAL_AUDIO_COMMANDS } from './ram/index.ts'

export const LOCAL_AUDIO_COMMANDS: {
  ram: readonly RegisteredCommand[]
  disk: readonly RegisteredCommand[]
} = {
  ram: RAM_LOCAL_AUDIO_COMMANDS,
  disk: DISK_LOCAL_AUDIO_COMMANDS,
}
