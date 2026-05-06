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

import { join } from 'node:path'
import {
  DiskResource,
  MountMode,
  Workspace,
  DISK_LOCAL_AUDIO_COMMANDS,
  RAM_LOCAL_AUDIO_COMMANDS,
  configureLocalAudio,
} from '@struktoai/mirage-node'

const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const DATA_DIR = join(REPO_ROOT, 'data')

// Mirrors Python's mirage.commands.audio.utils.configure(model_dir=...).
// sherpa-onnx-node + wavefile are optional peers of @struktoai/mirage-node; install
// them in your app if you use the built-in transcriber:
//   pnpm add sherpa-onnx-node wavefile
configureLocalAudio({ modelDir: join(REPO_ROOT, 'models/sherpa-onnx-whisper-base') })

async function run(ws: Workspace, cmd: string): Promise<void> {
  console.log(`\n$ ${cmd}`)
  const r = await ws.execute(cmd)
  const out = r.stdoutText.replace(/\s+$/, '')
  if (out !== '') console.log(out)
  const err = r.stderrText.replace(/\s+$/, '')
  if (err !== '') console.error('stderr:', err)
  if (r.exitCode !== 0) console.error(`exit=${String(r.exitCode)}`)
}

async function main(): Promise<void> {
  const ws = new Workspace(
    { '/': new DiskResource({ root: DATA_DIR }) },
    { mode: MountMode.READ },
  )
  ws.mount('/')?.registerFns(DISK_LOCAL_AUDIO_COMMANDS)
  ws.cacheMount.registerFns(RAM_LOCAL_AUDIO_COMMANDS)

  console.log(`mounted / → ${DATA_DIR}`)

  console.log('\n━━━ stat (metadata only — music-metadata, no transcription) ━━━')
  await run(ws, 'stat /example.wav')
  await run(ws, 'stat /example.mp3')
  await run(ws, 'stat /example.ogg')

  console.log('\n━━━ cat (full WAV transcription) ━━━')
  await run(ws, 'cat /example.wav')

  console.log('\n━━━ head -n 5 (first 5 seconds of WAV) ━━━')
  await run(ws, 'head -n 5 /example.wav')

  console.log('\n━━━ cat | grep (search transcription) ━━━')
  await run(ws, 'cat /example.wav | grep -i nightfall')

  await ws.close()
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
