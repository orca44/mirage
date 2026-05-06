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

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { BoxResource, MountMode, Workspace } from '@struktoai/mirage-node'

const __HERE = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__HERE, '../../../.env.development'), override: true })

async function main(): Promise<void> {
  const r = new BoxResource({ accessToken: process.env.BOX_DEVELOPER_TOKEN! })
  const ws = new Workspace({ '/box': r }, { mode: MountMode.READ })
  try {
    console.log('=== stat /box/test.boxnote.json ===')
    console.log((await ws.execute('stat /box/test.boxnote.json')).stdoutText.trim())

    console.log('\n=== cat /box/test.boxnote.json (mirage-processed) ===')
    console.log((await ws.execute('cat /box/test.boxnote.json')).stdoutText)

    console.log('=== cat /box/test.boxnote.json | jq -r .body_text ===')
    console.log((await ws.execute('cat /box/test.boxnote.json | jq -r .body_text')).stdoutText)

    console.log('=== cat /box/test.boxnote.json | jq .authors ===')
    console.log((await ws.execute('cat /box/test.boxnote.json | jq .authors')).stdoutText)

    console.log('=== wc -l /box/test.boxnote.json ===')
    console.log((await ws.execute('wc -l /box/test.boxnote.json')).stdoutText)
  } finally {
    await ws.close()
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
