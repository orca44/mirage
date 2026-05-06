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

import { readdir, stat } from 'node:fs/promises'
import dotenv from 'dotenv'
import { FuseManager, MountMode, PostgresResource, Workspace } from '@struktoai/mirage-node'

dotenv.config({ path: '.env.development' })

const dsn = process.env.POSTGRES_DSN
if (dsn === undefined) {
  console.error('POSTGRES_DSN missing in .env.development')
  process.exit(1)
}

const DEC = new TextDecoder()

async function main(): Promise<void> {
  const resource = new PostgresResource({
    dsn,
    maxReadRows: 1_000_000,
    maxReadBytes: 512 * 1024 * 1024,
  })
  const ws = new Workspace({ '/pg/': resource }, { mode: MountMode.READ })
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
    for (const e of (await readdir(`${mp}/pg`)).sort()) console.log(`  ${e}`)

    console.log('\n--- ws.execute(cat database.json | jq .schemas) ---')
    const r1 = await ws.execute('cat /pg/database.json | jq ".schemas"')
    process.stdout.write(DEC.decode(r1.stdout))

    const tables = (await readdir(`${mp}/pg/public/tables`)).sort()
    console.log(`\n--- public.tables: ${String(tables.length)} entries ---`)
    for (const t of tables.slice(0, 5)) console.log(`  ${t}`)

    if (tables.length === 0) return
    const target = tables[0]!
    const dir = `/pg/public/tables/${target}`

    console.log(`\n--- fs.readdir(${mp}${dir}) ---`)
    for (const e of await readdir(`${mp}${dir}`)) console.log(`  ${e}`)

    console.log(`\n--- fs.stat(${mp}${dir}/rows.jsonl) ---`)
    const st = await stat(`${mp}${dir}/rows.jsonl`)
    console.log(`  size=${String(st.size)} type=${st.isFile() ? 'file' : 'dir'}`)

    console.log(`\n--- ws.execute(jq .name ${dir}/schema.json) ---`)
    const r2 = await ws.execute(`jq ".name" ${dir}/schema.json`)
    process.stdout.write(DEC.decode(r2.stdout))

    console.log(`\n--- ws.execute(head -n 1 ${dir}/rows.jsonl) ---`)
    const r3 = await ws.execute(`head -n 1 ${dir}/rows.jsonl`)
    process.stdout.write(DEC.decode(r3.stdout).slice(0, 200))
    console.log('...')

    console.log(`\n--- ws.execute(wc -l ${dir}/rows.jsonl) ---`)
    const r4 = await ws.execute(`wc -l ${dir}/rows.jsonl`)
    process.stdout.write(DEC.decode(r4.stdout))

    console.log(`\n>>> FUSE mounted at: ${mp}`)
    console.log('>>> You can open another terminal and try:')
    console.log(`>>>   ls ${mp}/pg/`)
    console.log(`>>>   cat ${mp}/pg/database.json | jq .schemas`)
    console.log(`>>>   head -n 3 ${mp}/pg/public/tables/${target}/rows.jsonl`)
    console.log('>>> Auto-unmounting now (run interactively for manual exploration).')
  } finally {
    await fm.close()
    await ws.close()
    await resource.close()
  }
}

await main()
