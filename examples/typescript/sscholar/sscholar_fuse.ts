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
import { FuseManager, MountMode, SSCholarPaperResource, Workspace } from '@struktoai/mirage-node'

dotenv.config({ path: '.env.development' })

const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY ?? null

const DEC = new TextDecoder()

async function main(): Promise<void> {
  const resource = new SSCholarPaperResource({ config: { apiKey }, prefix: '/sscholar' })
  const ws = new Workspace({ '/sscholar/': resource }, { mode: MountMode.READ })
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

    console.log('--- fs.readdir(/sscholar) ---')
    const fields = (await readdir(`${mp}/sscholar`)).sort()
    for (const f of fields.slice(0, 10)) console.log(`  ${f}`)
    console.log(`  ... (${String(fields.length)} total)`)

    console.log(`\n--- fs.readdir(/sscholar/computer-science) ---`)
    const years = (await readdir(`${mp}/sscholar/computer-science`)).sort()
    console.log(`  first: ${years[0] ?? '(none)'}, last: ${years[years.length - 1] ?? '(none)'}`)

    const yearDir = `/sscholar/computer-science/2024`
    console.log(`\n--- fs.readdir(${yearDir}) ---`)
    let ids: string[] = []
    try {
      ids = (await readdir(`${mp}${yearDir}`)).sort()
      console.log(`  ${String(ids.length)} papers`)
    } catch (err) {
      console.log(`  ERROR: ${err instanceof Error ? err.message : String(err)}`)
      console.log('  (likely 429 rate limit — set SEMANTIC_SCHOLAR_API_KEY to fix)')
    }

    if (ids.length > 0) {
      const id = ids[0]!
      const base = `/sscholar/computer-science/2024/${id}`
      console.log(`\n--- fs.stat(${mp}${base}/meta.json) ---`)
      const st = await stat(`${mp}${base}/meta.json`)
      console.log(`  size=${String(st.size)} type=${st.isFile() ? 'file' : 'dir'}`)

      console.log(`\n--- ws.execute(cat ${base}/tldr.txt) ---`)
      const r = await ws.execute(`cat ${base}/tldr.txt`)
      process.stdout.write(DEC.decode(r.stdout))
    }

    console.log(`\n>>> FUSE mounted at: ${mp}`)
    console.log('>>> In another terminal you can:')
    console.log(`>>>   ls ${mp}/sscholar/`)
    console.log(`>>>   cat ${mp}/sscholar/computer-science/2024/<paperId>/abstract.txt`)
    console.log('>>> Auto-unmounting now (run interactively for manual exploration).')
  } finally {
    await fm.close()
    await ws.close()
    await resource.close()
  }
}

await main()
