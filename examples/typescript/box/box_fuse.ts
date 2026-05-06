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

import { readdir, readFile, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { BoxResource, FuseManager, MountMode, Workspace, type BoxConfig } from '@struktoai/mirage-node'

const __HERE = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__HERE, '../../../.env.development'), override: true })

function buildConfig(): BoxConfig {
  const devToken = process.env.BOX_DEVELOPER_TOKEN ?? process.env.BOX_ACCESS_TOKEN ?? ''
  if (devToken !== '') {
    return { accessToken: devToken }
  }
  const clientId = process.env.BOX_CLIENT_ID ?? ''
  const clientSecret = process.env.BOX_CLIENT_SECRET ?? ''
  const refreshToken = process.env.BOX_REFRESH_TOKEN ?? ''
  if (clientId === '' || clientSecret === '' || refreshToken === '') {
    throw new Error(
      'Provide BOX_DEVELOPER_TOKEN, or BOX_CLIENT_ID + BOX_CLIENT_SECRET + BOX_REFRESH_TOKEN',
    )
  }
  return { clientId, clientSecret, refreshToken }
}

async function gracefulCleanup(fm: FuseManager, ws: Workspace, mp: string): Promise<void> {
  try { await fm.close(ws) } catch {}
  try { await ws.close() } catch {}
  console.error(`\n>>> unmounted ${mp}`)
}

async function main(): Promise<void> {
  const resource = new BoxResource(buildConfig())
  const ws = new Workspace({ '/box': resource }, { mode: MountMode.READ })
  const fm = new FuseManager()
  const mp = await fm.setup(ws)
  let cleaned = false
  const handler = (sig: NodeJS.Signals): void => {
    if (cleaned) return
    cleaned = true
    void gracefulCleanup(fm, ws, mp).then(() => process.exit(sig === 'SIGINT' ? 130 : 143))
  }
  process.on('SIGINT', handler)
  process.on('SIGTERM', handler)
  try {
    console.log(`=== FUSE MODE: mounted at ${mp} ===\n`)
    const top = await readdir(`${mp}/box`)
    for (const r of top.slice(0, 10)) console.log(`  ${r}`)
    if (top.length > 10) console.log(`  ... (${String(top.length)} total)`)

    if (top[0] !== undefined) {
      const path = `${mp}/box/${top[0]}`
      const s = await stat(path)
      console.log(`\n--- stat ${top[0]} → isDir=${String(s.isDirectory())} size=${String(s.size)}`)
      if (s.isFile() && s.size < 1024 * 1024) {
        const text = await readFile(path, 'utf-8')
        console.log(text.slice(0, 200))
      }
    }

    console.log(`\n>>> FUSE mounted at: ${mp}`)
    console.log('>>> Try in another terminal:')
    console.log(`>>>   ls ${mp}/box/`)
    console.log(`>>>   find ${mp}/box -type f | head`)
    console.log('>>> Press Enter to unmount and exit...')

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    await rl.question('')
    rl.close()
  } finally {
    await fm.close(ws)
    await ws.close()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
