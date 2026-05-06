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

import { readdir, readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import {
  FuseManager,
  LangfuseResource,
  MountMode,
  Workspace,
  type LangfuseConfig,
} from '@struktoai/mirage-node'

const __HERE = fileURLToPath(new URL('.', import.meta.url))
dotenv.config({ path: resolve(__HERE, '../../../.env.development') })

function buildConfig(): LangfuseConfig {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  const host = process.env.LANGFUSE_HOST
  if (publicKey === undefined || publicKey === '') {
    throw new Error('LANGFUSE_PUBLIC_KEY env var is required')
  }
  if (secretKey === undefined || secretKey === '') {
    throw new Error('LANGFUSE_SECRET_KEY env var is required')
  }
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const cfg: LangfuseConfig = {
    publicKey,
    secretKey,
    defaultTraceLimit: 10,
    defaultFromTimestamp: sevenDaysAgo,
  }
  if (host !== undefined && host !== '') cfg.host = host
  return cfg
}

async function main(): Promise<void> {
  const resource = new LangfuseResource(buildConfig())
  const ws = new Workspace({ '/langfuse': resource }, { mode: MountMode.READ })
  const fm = new FuseManager()
  const mp = await fm.setup(ws)
  let cleaned = false
  const handler = (sig: NodeJS.Signals): void => {
    if (cleaned) return
    cleaned = true
    void (async (): Promise<void> => {
      try {
        await fm.close(ws)
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
    console.log(`=== FUSE MODE: mounted at ${mp} ===\n`)

    console.log('--- readdir() /langfuse ---')
    for (const r of await readdir(`${mp}/langfuse`)) console.log(`  ${r}`)

    console.log('\n--- readdir() /langfuse/datasets ---')
    const datasets = await readdir(`${mp}/langfuse/datasets`)
    for (const d of datasets) console.log(`  ${d}`)

    if (datasets.length > 0) {
      const d0 = datasets[0]!
      console.log(`\n--- readFile() /langfuse/datasets/${d0}/items.jsonl (first line) ---`)
      const bytes = await readFile(`${mp}/langfuse/datasets/${d0}/items.jsonl`, 'utf-8')
      const first = bytes.split('\n').find((l) => l.trim() !== '') ?? ''
      console.log(`  ${first.slice(0, 200)}`)
    }

    console.log('\n--- readdir() /langfuse/prompts ---')
    const prompts = await readdir(`${mp}/langfuse/prompts`)
    for (const p of prompts.slice(0, 5)) console.log(`  ${p}`)

    if (prompts.length > 0) {
      const p0 = prompts[0]!
      const versions = await readdir(`${mp}/langfuse/prompts/${p0}`)
      if (versions.length > 0) {
        const v0 = versions[0]!
        console.log(`\n--- readFile() /langfuse/prompts/${p0}/${v0} ---`)
        const promptBytes = await readFile(`${mp}/langfuse/prompts/${p0}/${v0}`, 'utf-8')
        try {
          const doc = JSON.parse(promptBytes) as Record<string, unknown>
          console.log(`  ${String(doc.name ?? '?')} v${String(doc.version ?? '?')}`)
        } catch {
          console.log(`  (raw: ${promptBytes.slice(0, 100)})`)
        }
      }
    }

    console.log('\n' + '='.repeat(72))
    console.log(`>>> FUSE mounted at:  ${mp}`)
    console.log(`>>> Langfuse root:    ${mp}/langfuse`)
    console.log('='.repeat(72))
    console.log('\n>>> Open in Finder:')
    console.log(`>>>   open ${mp}/langfuse`)
    console.log('>>> Or in another terminal:')
    console.log(`>>>   ls ${mp}/langfuse/`)
    console.log(`>>>   cat ${mp}/langfuse/datasets/<name>/items.jsonl`)
    console.log(`>>>   tree ${mp}/langfuse/prompts/`)
    console.log('\n>>> Press Enter to unmount and exit...')

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    await rl.question('')
    rl.close()

    const records = ws.records
    const total = records.reduce((acc, r) => acc + (r.bytes ?? 0), 0)
    console.log(`\nStats: ${String(records.length)} ops, ${String(total)} bytes transferred`)
  } finally {
    await fm.close()
    await ws.close()
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
