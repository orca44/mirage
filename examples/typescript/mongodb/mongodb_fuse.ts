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

import { setServers } from 'node:dns'
import { readdir, stat } from 'node:fs/promises'
import dotenv from 'dotenv'
import { FuseManager, MongoDBResource, MountMode, Workspace } from '@struktoai/mirage-node'

setServers(['8.8.8.8', '1.1.1.1'])
dotenv.config({ path: '.env.development' })

const uri = process.env.MONGODB_URI
if (uri === undefined) {
  console.error('MONGODB_URI missing in .env.development')
  process.exit(1)
}

const DEC = new TextDecoder()

async function main(): Promise<void> {
  const resource = new MongoDBResource({
    uri,
    defaultDocLimit: 1000,
    maxDocLimit: 100_000,
  })
  const ws = new Workspace({ '/mongodb/': resource }, { mode: MountMode.READ })
  const fm = new FuseManager()
  const mp = await fm.setup(ws)
  let cleaned = false
  const handler = (sig: NodeJS.Signals): void => {
    if (cleaned) return
    cleaned = true
    void (async (): Promise<void> => {
      try {
        await fm.close()
      } catch {}
      try {
        await ws.close()
      } catch {}
      console.error(`\n>>> unmounted ${mp}`)
      process.exit(sig === 'SIGINT' ? 130 : 143)
    })()
  }
  process.on('SIGINT', handler)
  process.on('SIGTERM', handler)

  try {
    console.log(`\n=== FUSE MODE: mounted at ${mp} ===\n`)

    console.log('--- fs.readdir() root ---')
    const dbs = (await readdir(`${mp}/mongodb`)).sort()
    for (const e of dbs) console.log(`  ${e}`)

    if (dbs.length === 0) return
    const target = dbs[0]!

    console.log(`\n--- fs.readdir(${mp}/mongodb/${target}) ---`)
    const cols = (await readdir(`${mp}/mongodb/${target}`)).sort()
    for (const c of cols.slice(0, 5)) console.log(`  ${c}`)

    if (cols.length === 0) return
    const colPath = `/mongodb/${target}/${cols[0]!}`

    console.log(`\n--- fs.stat(${mp}${colPath}) ---`)
    const st = await stat(`${mp}${colPath}`)
    console.log(`  size=${String(st.size)} type=${st.isFile() ? 'file' : 'dir'}`)

    console.log(`\n--- ws.execute(head -n 1 ${colPath}) ---`)
    const r = await ws.execute(`head -n 1 ${colPath}`)
    process.stdout.write(DEC.decode(r.stdout).slice(0, 200))
    console.log('...')

    console.log(`\n--- ws.execute(wc -l ${colPath}) ---`)
    const w = await ws.execute(`wc -l ${colPath}`)
    process.stdout.write(DEC.decode(w.stdout))

    console.log(`\n>>> FUSE mounted at: ${mp}`)
    console.log('>>> You could open another terminal and try:')
    console.log(`>>>   ls ${mp}/mongodb/`)
    console.log(`>>>   head -n 3 ${mp}${colPath}`)
    console.log('>>> Auto-unmounting now (run interactively for manual exploration).')
  } finally {
    await fm.close()
    await ws.close()
    await resource.close()
  }
}

await main()
