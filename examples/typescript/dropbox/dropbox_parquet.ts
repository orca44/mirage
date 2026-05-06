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
import { DropboxResource, MountMode, Workspace } from '@struktoai/mirage-node'

const __HERE = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__HERE, '../../../.env.development'), override: true })

async function main(): Promise<void> {
  const r = new DropboxResource({
    clientId: process.env.DROPBOX_APP_KEY!,
    clientSecret: process.env.DROPBOX_APP_SECRET!,
    refreshToken: process.env.DROPBOX_REFRESH_TOKEN!,
  })
  const ws = new Workspace({ '/dropbox': r }, { mode: MountMode.READ })
  try {
    const ls = await ws.execute('ls /dropbox/data/')
    console.log('=== ls /dropbox/data/ ===')
    console.log(ls.stdoutText.trim())
    if (ls.stderrText.trim() !== '') console.error('STDERR:', ls.stderrText.trim())

    const stat = await ws.execute('stat /dropbox/data/example.parquet')
    console.log('\n=== stat /dropbox/data/example.parquet ===')
    console.log(stat.stdoutText.trim())

    const cat = await ws.execute('cat /dropbox/data/example.parquet')
    console.log('\n=== cat /dropbox/data/example.parquet ===')
    console.log(cat.stdoutText.slice(0, 2000))
    if (cat.stderrText.trim() !== '') console.error('STDERR:', cat.stderrText.slice(0, 500))
    console.log(`exit=${String(cat.exitCode)}`)
  } finally {
    await ws.close()
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
