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
import { BoxResource, MountMode, Workspace, type BoxConfig } from '@struktoai/mirage-node'

const __HERE = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__HERE, '../../../.env.development'), override: true })

function buildConfig(): BoxConfig {
  const devToken = process.env.BOX_DEVELOPER_TOKEN ?? process.env.BOX_ACCESS_TOKEN ?? ''
  if (devToken !== '') return { accessToken: devToken }
  return {
    clientId: process.env.BOX_CLIENT_ID!,
    clientSecret: process.env.BOX_CLIENT_SECRET!,
    refreshToken: process.env.BOX_REFRESH_TOKEN!,
  }
}

async function main(): Promise<void> {
  const r = new BoxResource(buildConfig())
  const ws = new Workspace({ '/box': r }, { mode: MountMode.READ })
  try {
    const ls = await ws.execute('ls /box/data/')
    console.log('=== ls /box/data/ ===')
    console.log(ls.stdoutText.trim())

    const stat = await ws.execute('stat /box/data/example.parquet')
    console.log('\n=== stat /box/data/example.parquet ===')
    console.log(stat.stdoutText.trim())

    const cat = await ws.execute('cat /box/data/example.parquet')
    console.log('\n=== cat /box/data/example.parquet ===')
    console.log(cat.stdoutText.slice(0, 2000))
    console.log(`exit=${String(cat.exitCode)}`)
  } finally {
    await ws.close()
  }
}

main().catch((e: unknown) => { console.error(e); process.exit(1) })
